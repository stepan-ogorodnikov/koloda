//! Joining an existing space: the local mode check, the claim, and the ids the space is probed for
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Joining).

use koloda_sync_proto::registry::Kind;
use rusqlite::{params, Connection};
use uuid::Uuid;

use super::apply::table;
use super::protocol_error;
use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::domain::seed_ids::{SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JoinMode {
    Blank,
    UntouchedSeed,
    Used,
    Reattach,
}

const PROBE_KINDS: [Kind; 5] = [
    Kind::Algorithms,
    Kind::AlgorithmRevisions,
    Kind::Templates,
    Kind::Decks,
    Kind::Cards,
];

const SYNC_TABLES: [&str; 6] = [
    "sync_state",
    "sync_stamps",
    "sync_origins",
    "sync_outbox",
    "sync_cohorts",
    "sync_tombstones",
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

pub fn begin_import(db: &Database, device_id: Uuid, space_id: Uuid) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        db.with_transaction(|tx| {
            // WHY: the claim replaces the device id, so nothing recorded for an earlier space may be pushed or
            // applied again. Add and Replace start from empty sync tables.
            for table in SYNC_TABLES {
                tx.execute(&format!("DELETE FROM {table}"), [])?;
            }
            tx.execute(
                r#"
                INSERT INTO sync_state (id, device_id, space_id, last_hlc, next_sender_seq, join_phase)
                VALUES (1, ?1, ?2, 0, 1, 'import_pending')
                "#,
                params![device_id.as_bytes().as_slice(), space_id.as_bytes().as_slice()],
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
