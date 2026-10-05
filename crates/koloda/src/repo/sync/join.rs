//! Joining an existing space: the local mode check, the claim, the ids the space is probed for, Add, and Replace
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Joining). A blank file seeds with `app::init::seed_joiner_db`.

use std::collections::HashMap;

use koloda_sync_proto::payload::{DefaultAlgorithm, DefaultTemplate, Payload};
use koloda_sync_proto::registry::Kind;
use rusqlite::{params, Connection, OptionalExtension, Params};
use uuid::Uuid;

use super::apply::{patch_learning, table};
use super::{backfill, protocol_error, SpaceRole};
use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::app::utility::generate_uuidv7;
use crate::domain::seed_ids::{SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID};
use crate::repo::settings::{learning_defaults, LEARNING_SYNC_ID};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JoinMode {
    Blank,
    UntouchedSeed,
    Used,
    Reattach,
}

/// The probe's answer for an id the space holds.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Known {
    Live,
    Fenced,
}

const PROBE_KINDS: [Kind; 5] = [
    Kind::Algorithms,
    Kind::AlgorithmRevisions,
    Kind::Templates,
    Kind::Decks,
    Kind::Cards,
];

const SYNC_TABLES: [&str; 7] = [
    "sync_state",
    "sync_stamps",
    "sync_origins",
    "sync_outbox",
    "sync_cohorts",
    "sync_tombstones",
    "sync_held",
];

pub fn join_mode(db: &Database, space_id: Uuid) -> Result<JoinMode, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let is_in_space: bool = conn.query_row(
                "SELECT EXISTS (SELECT 1 FROM sync_state WHERE id = 1 AND space_id = ?1 AND join_phase = 'active')",
                params![space_id.as_bytes().as_slice()],
                |row| row.get(0),
            )?;
            if is_in_space {
                return Ok(JoinMode::Reattach);
            }

            let has_settings: bool = conn.query_row("SELECT EXISTS (SELECT 1 FROM settings)", [], |row| row.get(0))?;
            if !has_settings {
                Ok(JoinMode::Blank)
            } else if holds_only_untouched_seed(conn)? {
                Ok(JoinMode::UntouchedSeed)
            } else {
                Ok(JoinMode::Used)
            }
        })
    })
}

// WHY: every save sets `updated_at`, so a NULL one is the only sign of an unmodified row that Rust can read; the
// first-run content comes from the TS host. Revisions outlive a deleted algorithm, so they are counted on their own.
fn holds_only_untouched_seed(conn: &Connection) -> Result<bool, AppError> {
    let is_untouched = conn.query_row(
        r#"
        SELECT (SELECT COUNT(*) FROM algorithms) = 1
           AND EXISTS (SELECT 1 FROM algorithms WHERE id = ?1 AND updated_at IS NULL)
           AND (SELECT COUNT(*) FROM algorithm_revisions) = 1
           AND EXISTS (SELECT 1 FROM algorithm_revisions WHERE algorithm_id = ?1)
           AND (SELECT COUNT(*) FROM templates) = 1
           AND EXISTS (SELECT 1 FROM templates WHERE id = ?2 AND updated_at IS NULL)
           AND NOT EXISTS (SELECT 1 FROM decks)
           AND NOT EXISTS (SELECT 1 FROM cards)
        "#,
        params![SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID],
        |row| row.get(0),
    )?;
    Ok(is_untouched)
}

pub fn begin_import(
    db: &Database,
    device_id: Uuid,
    space_id: Uuid,
    epoch: Uuid,
    server_url: &str,
) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        db.with_transaction(|tx| {
            // WHY: the claim replaces the device id, so nothing recorded for an earlier space may be pushed or
            // applied again. Add and Replace start from empty sync tables.
            for table in SYNC_TABLES {
                tx.execute(&format!("DELETE FROM {table}"), [])?;
            }
            tx.execute(
                r#"
                INSERT INTO sync_state (id, device_id, space_id, last_hlc, next_sender_seq, join_phase, epoch, server_url)
                VALUES (1, ?1, ?2, 0, 1, 'import_pending', ?3, ?4)
                "#,
                params![
                    device_id.as_bytes().as_slice(),
                    space_id.as_bytes().as_slice(),
                    epoch.as_bytes().as_slice(),
                    server_url
                ],
            )?;
            Ok(())
        })
    })
}

pub fn probe_ids(db: &Database, after: Option<&(Kind, String)>, limit: usize) -> Result<Vec<(Kind, String)>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let (start, mut after_id) = match after {
                Some((kind, id)) => {
                    let start = PROBE_KINDS
                        .iter()
                        .position(|probed| probed == kind)
                        .ok_or_else(|| protocol_error(format!("{} is not probed", kind.as_wire())))?;
                    (start, Some(id.as_str()))
                }
                None => (0, None),
            };

            let mut ids = Vec::new();
            for kind in PROBE_KINDS.iter().skip(start) {
                let remaining = i64::try_from(limit - ids.len()).map_err(protocol_error)?;
                if remaining == 0 {
                    break;
                }
                let (table, key) = table(*kind);
                let mut stmt = conn.prepare(&format!(
                    "SELECT {key} FROM {table} WHERE (?1 IS NULL OR {key} > ?1) ORDER BY {key} LIMIT ?2"
                ))?;
                let page = stmt
                    .query_map(params![after_id, remaining], |row| row.get::<_, String>(0))?
                    .collect::<Result<Vec<_>, _>>()?;
                ids.extend(page.into_iter().map(|id| (*kind, id)));
                after_id = None;
            }
            Ok(ids)
        })
    })
}

pub fn add_to_space(db: &Database, known: &HashMap<String, Known>) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_transaction(|tx| {
            require_pending(tx)?;
            let reminted_seeds = settle_seeds(tx, known)?;
            remint(tx, |id| {
                reminted_seeds.contains(&id.as_str()) || (known.contains_key(id) && !is_seed(id))
            })?;
            activate(tx)
        })
    })
}

pub fn replace_with_space(db: &Database) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_DELETE, || {
        db.with_transaction(|tx| {
            require_pending(tx)?;
            // WHY: only product rows go. Settings stay at stamp zero for the space to overlay, and conversations are
            // device-local. Attachments are content-addressed: cards from the space reuse their bytes, and the
            // startup sweep removes the rest.
            for table in [
                "reviews",
                "cards",
                "decks",
                "algorithm_revisions",
                "algorithms",
                "templates",
            ] {
                tx.execute(&format!("DELETE FROM {table}"), [])?;
            }
            activate(tx)
        })
    })
}

fn require_pending(conn: &Connection) -> Result<(), AppError> {
    let is_pending: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sync_state WHERE id = 1 AND join_phase = 'import_pending')",
        [],
        |row| row.get(0),
    )?;
    if is_pending {
        Ok(())
    } else {
        Err(protocol_error("only a pending import joins a space"))
    }
}

// INVARIANT: the backfill stamps are reserved in the transaction that makes the file active, so every write
// captured afterwards is stamped above them.
fn activate(conn: &Connection) -> Result<(), AppError> {
    conn.execute(
        "UPDATE sync_state SET join_phase = 'active', role = ?1, is_bootstrapping = 1 WHERE id = 1",
        params![SpaceRole::Joiner.as_sql()],
    )?;
    backfill::reserve(conn)
}

fn is_seed(id: &str) -> bool {
    id == SEED_ALGORITHM_SIMPLE_ID || id == SEED_TEMPLATE_TYPE_ID
}

// WHY: every first run mints the seed ids again, so a seed id the space holds is the same starter row, not a copy.
// An unmodified one the space holds live is overlaid by the space's create. Any other seed row that is in use moves
// to a new id, because a joiner never pushes a seed id; an unused one is deleted (PROTOCOL.md, Joining).
fn settle_seeds(conn: &Connection, known: &HashMap<String, Known>) -> Result<Vec<&'static str>, AppError> {
    let mut reminted = Vec::new();

    if let Some(is_unmodified) = is_unmodified(conn, Kind::Algorithms, SEED_ALGORITHM_SIMPLE_ID)? {
        let is_live = known.get(SEED_ALGORITHM_SIMPLE_ID) == Some(&Known::Live);
        let is_used = exists(
            conn,
            "SELECT 1 FROM decks WHERE algorithm_id = ?1",
            SEED_ALGORITHM_SIMPLE_ID,
        )?;
        if is_unmodified && (is_live || !is_used) {
            conn.execute(
                "DELETE FROM algorithm_revisions WHERE algorithm_id = ?1",
                [SEED_ALGORITHM_SIMPLE_ID],
            )?;
            if !is_live {
                conn.execute("DELETE FROM algorithms WHERE id = ?1", [SEED_ALGORITHM_SIMPLE_ID])?;
            }
        } else {
            reminted.push(SEED_ALGORITHM_SIMPLE_ID);
        }
    }

    if let Some(is_unmodified) = is_unmodified(conn, Kind::Templates, SEED_TEMPLATE_TYPE_ID)? {
        let is_live = known.get(SEED_TEMPLATE_TYPE_ID) == Some(&Known::Live);
        let has_cards = exists(
            conn,
            "SELECT 1 FROM cards WHERE template_id = ?1",
            SEED_TEMPLATE_TYPE_ID,
        )?;
        let has_decks = exists(
            conn,
            "SELECT 1 FROM decks WHERE template_id = ?1",
            SEED_TEMPLATE_TYPE_ID,
        )?;
        if is_unmodified && !has_cards && (is_live || !has_decks) {
            if !is_live {
                conn.execute("DELETE FROM templates WHERE id = ?1", [SEED_TEMPLATE_TYPE_ID])?;
            }
        } else {
            reminted.push(SEED_TEMPLATE_TYPE_ID);
        }
    }

    Ok(reminted)
}

fn is_unmodified(conn: &Connection, kind: Kind, id: &str) -> Result<Option<bool>, AppError> {
    let (table, key) = table(kind);
    let is_unmodified = conn
        .query_row(
            &format!("SELECT updated_at IS NULL FROM {table} WHERE {key} = ?1"),
            [id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(is_unmodified)
}

fn exists(conn: &Connection, sql: &str, id: &str) -> Result<bool, AppError> {
    let is_found = conn.query_row(&format!("SELECT EXISTS ({sql})"), [id], |row| row.get(0))?;
    Ok(is_found)
}

// WHY: the space would drop a known id as a duplicate, or fence it. The row moves to a new id with every row whose
// id follows from it, so both copies survive; pointers that name it move along.
fn remint(conn: &Connection, is_known: impl Fn(&String) -> bool) -> Result<(), AppError> {
    let algorithms = mint(
        column(conn, "SELECT id FROM algorithms", [])?
            .into_iter()
            .filter(&is_known),
    );
    let revisions = mint(
        pairs(conn, "SELECT id, algorithm_id FROM algorithm_revisions")?
            .into_iter()
            .filter(|(id, algorithm_id)| is_known(id) || algorithms.contains_key(algorithm_id))
            .map(|(id, _)| id),
    );
    let templates = mint(
        column(conn, "SELECT id FROM templates", [])?
            .into_iter()
            .filter(&is_known),
    );
    let decks = mint(column(conn, "SELECT id FROM decks", [])?.into_iter().filter(&is_known));
    let cards = mint(
        pairs(conn, "SELECT id, deck_id FROM cards")?
            .into_iter()
            .filter(|(id, deck_id)| is_known(id) || decks.contains_key(deck_id))
            .map(|(id, _)| id),
    );
    let mut reviews = HashMap::new();
    for card_id in cards.keys() {
        reviews.extend(mint(column(
            conn,
            "SELECT id FROM reviews WHERE card_id = ?1",
            [card_id],
        )?));
    }

    // INVARIANT: foreign keys are checked at commit. A row and the rows that name it move in separate statements.
    conn.pragma_update(None, "defer_foreign_keys", true)?;
    let remints = [
        (Kind::Algorithms, &algorithms),
        (Kind::AlgorithmRevisions, &revisions),
        (Kind::Templates, &templates),
        (Kind::Decks, &decks),
        (Kind::Cards, &cards),
        (Kind::Reviews, &reviews),
    ];
    for (kind, ids) in remints {
        let (table, key) = table(kind);
        for (old, new) in ids {
            conn.prepare_cached(&format!("UPDATE {table} SET {key} = ?2 WHERE {key} = ?1"))?
                .execute(params![old, new])?;
            for (holder, pointer) in pointers(kind) {
                conn.prepare_cached(&format!("UPDATE {holder} SET {pointer} = ?2 WHERE {pointer} = ?1"))?
                    .execute(params![old, new])?;
            }
        }
    }

    repoint_learning(conn, &algorithms, &templates)
}

fn pointers(kind: Kind) -> &'static [(&'static str, &'static str)] {
    match kind {
        Kind::Algorithms => &[("decks", "algorithm_id"), ("algorithm_revisions", "algorithm_id")],
        Kind::Templates => &[("decks", "template_id"), ("cards", "template_id")],
        Kind::Decks => &[("cards", "deck_id")],
        Kind::Cards => &[("reviews", "card_id")],
        _ => &[],
    }
}

fn repoint_learning(
    conn: &Connection,
    algorithms: &HashMap<String, String>,
    templates: &HashMap<String, String>,
) -> Result<(), AppError> {
    let Some(defaults) = learning_defaults(conn)? else {
        return Ok(());
    };
    if let Some(algorithm_id) = algorithms.get(&defaults.algorithm) {
        let payload = Payload::LearningDefaultAlgorithm(DefaultAlgorithm {
            algorithm_id: algorithm_id.clone(),
        });
        patch_learning(conn, LEARNING_SYNC_ID, &payload)?;
    }
    if let Some(template_id) = templates.get(&defaults.template) {
        let payload = Payload::LearningDefaultTemplate(DefaultTemplate {
            template_id: template_id.clone(),
        });
        patch_learning(conn, LEARNING_SYNC_ID, &payload)?;
    }
    Ok(())
}

fn mint(ids: impl IntoIterator<Item = String>) -> HashMap<String, String> {
    ids.into_iter().map(|id| (id, generate_uuidv7())).collect()
}

fn column(conn: &Connection, sql: &str, params: impl Params) -> Result<Vec<String>, AppError> {
    let ids = conn
        .prepare_cached(sql)?
        .query_map(params, |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(ids)
}

fn pairs(conn: &Connection, sql: &str) -> Result<Vec<(String, String)>, AppError> {
    let pairs = conn
        .prepare(sql)?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    Ok(pairs)
}
