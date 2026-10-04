//! Remote apply: envelopes other devices captured, one pull page per transaction
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Field groups and merge, Apply rule).
//!
//! Apply writes product rows with its own SQL and never calls repo write paths: those capture, and a remote
//! write must not re-enter the outbox.

use koloda_sync_proto::envelope::{Envelope, Header};
use koloda_sync_proto::hlc::{DeviceId, Hlc, HlcClock};
use koloda_sync_proto::payload::{AlgorithmRevision, CardCreate, DeckCreate, DocumentCreate, Payload};
use koloda_sync_proto::registry::{allow, check_lane, Class, Kind, Lane};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use super::{protocol_error, StampValues, ROW_GROUP};
use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::domain::seed_ids::{SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID};

/// One pull page: one lane's entries in `seq` order, and the highest seq the server examined for that lane.
pub struct Page {
    pub lane: Lane,
    pub entries: Vec<PageEntry>,
    pub scanned_through: i64,
}

pub struct PageEntry {
    pub sender: Uuid,
    pub sender_seq: i64,
    pub envelope: Vec<u8>,
}

struct Entry {
    header: Header,
    payload: Payload,
    values: StampValues,
}

/// Applies one page and returns the kinds whose product rows it changed.
pub fn apply_page(db: &Database, page: &Page) -> Result<Vec<Kind>, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        // INVARIANT: decode the whole page before writing. An entry that does not decode fails the page, so the
        // cursor never moves past an envelope that was not applied.
        let entries = page
            .entries
            .iter()
            .map(|entry| decode(page.lane, entry))
            .collect::<Result<Vec<_>, _>>()?;

        db.with_transaction(|tx| {
            let mut clock = read_clock(tx)?;
            let mut changed = Vec::new();
            for entry in &entries {
                clock.observe(entry.header.stamp.hlc);
                if apply_entry(tx, entry)? && !changed.contains(&entry.header.kind) {
                    changed.push(entry.header.kind);
                }
            }

            let cursor = match page.lane {
                Lane::Hot => "cursor_hot",
                Lane::Cold => "cursor_cold",
            };
            let last_hlc = i64::try_from(clock.last.raw()).map_err(protocol_error)?;
            tx.execute(
                &format!("UPDATE sync_state SET last_hlc = ?1, {cursor} = ?2 WHERE id = 1"),
                params![last_hlc, page.scanned_through],
            )?;

            Ok(changed)
        })
    })
}

fn decode(lane: Lane, entry: &PageEntry) -> Result<Entry, AppError> {
    let envelope = Envelope::decode(&entry.envelope).map_err(protocol_error)?;
    check_lane(envelope.header.kind, lane).map_err(protocol_error)?;
    let payload = Payload::decode(&envelope.header, &envelope.payload).map_err(protocol_error)?;
    let values = StampValues::new(
        envelope.header.stamp,
        DeviceId(*entry.sender.as_bytes()),
        entry.sender_seq,
    )?;

    Ok(Entry {
        header: envelope.header,
        payload,
        values,
    })
}

fn read_clock(conn: &Connection) -> Result<HlcClock, AppError> {
    let last_hlc: i64 = conn
        .query_row("SELECT last_hlc FROM sync_state WHERE id = 1", [], |row| row.get(0))
        .optional()?
        .ok_or_else(|| protocol_error("only an enrolled database applies sync envelopes"))?;

    Ok(HlcClock {
        last: Hlc::from_raw(u64::try_from(last_hlc).map_err(protocol_error)?),
    })
}

fn apply_entry(conn: &Connection, entry: &Entry) -> Result<bool, AppError> {
    let header = &entry.header;
    if !has_referents(conn, header)? {
        return Ok(false);
    }

    let class = allow(header.kind, header.group, header.op)
        .map_err(protocol_error)?
        .map(|spec| spec.class);
    match class {
        Some(Class::Create) => apply_create(conn, entry),
        Some(Class::Immutable) => apply_immutable(conn, entry),
        Some(Class::Update) | None => Ok(false),
    }
}

// INVARIANT: a missing parent or referent drops the envelope (apply rule step 3). Apply never invents a row,
// and a referent's create always sits below its referers, so missing here means it will not arrive.
fn has_referents(conn: &Connection, header: &Header) -> Result<bool, AppError> {
    let parent = header.kind.spec().parent.zip(header.parent.as_deref());
    let refs = [
        header.refs.algorithm_id.as_deref().map(|id| (Kind::Algorithms, id)),
        header.refs.template_id.as_deref().map(|id| (Kind::Templates, id)),
    ];
    for (kind, id) in std::iter::once(parent).chain(refs).flatten() {
        if !is_present(conn, kind, id)? {
            return Ok(false);
        }
    }
    Ok(true)
}

fn apply_create(conn: &Connection, entry: &Entry) -> Result<bool, AppError> {
    let kind = entry.header.kind;
    let id = entry.header.id.as_str();
    if is_present(conn, kind, id)? && !is_stamp_zero_seed(conn, kind, id)? {
        return Ok(false);
    }

    match &entry.payload {
        Payload::CardCreate(create) => insert_card(conn, id, create)?,
        Payload::DeckCreate(create) => insert_deck(conn, id, create)?,
        Payload::TemplateCreate(create) => upsert_document(conn, Kind::Templates, id, create)?,
        Payload::AlgorithmCreate(create) => upsert_document(conn, Kind::Algorithms, id, create)?,
        _ => return Err(protocol_error("a create group carries a create payload")),
    }
    entry.values.write_create(conn, kind, id, &entry.payload)?;
    refresh_updated_at(conn, kind, id)?;

    Ok(true)
}

// WHY: every first run mints the seed ids again. An untouched local seed row (no register, no origin) is the
// same starter row the space holds, so the space's create replaces it instead of being dropped as a duplicate.
fn is_stamp_zero_seed(conn: &Connection, kind: Kind, id: &str) -> Result<bool, AppError> {
    let is_seed = matches!(
        (kind, id),
        (Kind::Algorithms, SEED_ALGORITHM_SIMPLE_ID) | (Kind::Templates, SEED_TEMPLATE_TYPE_ID)
    );
    if !is_seed {
        return Ok(false);
    }

    let is_stamped: bool = conn.query_row(
        r#"
        SELECT EXISTS (SELECT 1 FROM sync_stamps WHERE kind = ?1 AND id = ?2)
            OR EXISTS (SELECT 1 FROM sync_origins WHERE kind = ?1 AND id = ?2)
        "#,
        params![kind.as_wire(), id],
        |row| row.get(0),
    )?;
    Ok(!is_stamped)
}

fn insert_card(conn: &Connection, id: &str, create: &CardCreate) -> Result<(), AppError> {
    let scheduling = &create.scheduling;
    conn.execute(
        r#"
        INSERT INTO cards (id, deck_id, template_id, content, state, due_at, stability, difficulty,
                           scheduled_days, learning_steps, reps, lapses, last_reviewed_at, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, NULL)
        "#,
        params![
            id,
            create.deck_id,
            create.template_id,
            create.content,
            scheduling.state,
            scheduling.due_at,
            scheduling.stability,
            scheduling.difficulty,
            scheduling.scheduled_days,
            scheduling.learning_steps,
            scheduling.reps,
            scheduling.lapses,
            scheduling.last_reviewed_at,
            create.created_at
        ],
    )?;
    Ok(())
}

// INVARIANT: a deck create carries no pointers, but the local foreign keys need real rows. The placeholders
// hold until the same-commit pointer groups overwrite them (PROTOCOL.md, Existence and order).
fn insert_deck(conn: &Connection, id: &str, create: &DeckCreate) -> Result<(), AppError> {
    let algorithm_id = lowest_live_id(conn, Kind::Algorithms)?
        .ok_or_else(|| protocol_error("a deck create needs a live algorithm for its placeholder"))?;
    let template_id = lowest_live_id(conn, Kind::Templates)?
        .ok_or_else(|| protocol_error("a deck create needs a live template for its placeholder"))?;
    conn.execute(
        r#"
        INSERT INTO decks (id, title, notes, algorithm_id, template_id, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)
        "#,
        params![
            id,
            create.title,
            create.notes,
            algorithm_id,
            template_id,
            create.created_at
        ],
    )?;
    Ok(())
}

fn upsert_document(conn: &Connection, kind: Kind, id: &str, create: &DocumentCreate) -> Result<(), AppError> {
    let (table, _) = table(kind);
    conn.execute(
        &format!(
            r#"
            INSERT INTO {table} (id, title, notes, content, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, NULL)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                notes = excluded.notes,
                content = excluded.content,
                created_at = excluded.created_at
            "#
        ),
        params![id, create.title, create.notes, create.content, create.created_at],
    )?;
    Ok(())
}

fn apply_immutable(conn: &Connection, entry: &Entry) -> Result<bool, AppError> {
    let kind = entry.header.kind;
    let id = entry.header.id.as_str();
    let Payload::AlgorithmRevision(revision) = &entry.payload else {
        return Ok(false);
    };
    if is_present(conn, kind, id)? {
        return Ok(false);
    }

    insert_algorithm_revision(conn, id, revision)?;
    entry.values.write_origin(conn, kind, id, ROW_GROUP, None)?;
    Ok(true)
}

fn insert_algorithm_revision(conn: &Connection, id: &str, revision: &AlgorithmRevision) -> Result<(), AppError> {
    conn.execute(
        r#"
        INSERT INTO algorithm_revisions (id, algorithm_id, content, actor, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
        params![
            id,
            revision.algorithm_id,
            revision.content,
            revision.actor,
            revision.created_at
        ],
    )?;
    Ok(())
}

// INVARIANT: `updated_at` is derived, never applied. It is the max `product_ts` across the entity's contributing
// registers and its create's legacy floor, so a losing write cannot leave its later timestamp behind.
fn refresh_updated_at(conn: &Connection, kind: Kind, id: &str) -> Result<(), AppError> {
    let contributing: Vec<&str> = kind
        .spec()
        .groups
        .iter()
        .filter(|spec| spec.contributes_updated_at)
        .map(|spec| spec.group.as_wire())
        .collect();
    if contributing.is_empty() {
        return Ok(());
    }

    let registers: Vec<(String, Option<i64>)> = conn
        .prepare("SELECT group_name, product_ts FROM sync_stamps WHERE kind = ?1 AND id = ?2")?
        .query_map(params![kind.as_wire(), id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let floor: Option<i64> = conn
        .query_row(
            "SELECT legacy_product_ts_floor FROM sync_origins WHERE kind = ?1 AND id = ?2 AND group_name = 'create'",
            params![kind.as_wire(), id],
            |row| row.get(0),
        )
        .optional()?
        .flatten();
    let updated_at = registers
        .into_iter()
        .filter(|(group, _)| contributing.contains(&group.as_str()))
        .filter_map(|(_, product_ts)| product_ts)
        .chain(floor)
        .max();

    let (table, key) = table(kind);
    conn.execute(
        &format!("UPDATE {table} SET updated_at = ?1 WHERE {key} = ?2"),
        params![updated_at, id],
    )?;
    Ok(())
}

fn lowest_live_id(conn: &Connection, kind: Kind) -> Result<Option<String>, AppError> {
    let (table, _) = table(kind);
    conn.query_row(&format!("SELECT id FROM {table} ORDER BY id LIMIT 1"), [], |row| {
        row.get(0)
    })
    .optional()
    .map_err(AppError::from)
}

fn is_present(conn: &Connection, kind: Kind, id: &str) -> Result<bool, AppError> {
    let (table, key) = table(kind);
    let row = conn
        .query_row(&format!("SELECT 1 FROM {table} WHERE {key} = ?1"), params![id], |_| {
            Ok(())
        })
        .optional()?;
    Ok(row.is_some())
}

/// The product table and key column that hold each kind's rows; the learning document is a settings row.
fn table(kind: Kind) -> (&'static str, &'static str) {
    match kind {
        Kind::Cards => ("cards", "id"),
        Kind::Reviews => ("reviews", "id"),
        Kind::Decks => ("decks", "id"),
        Kind::Templates => ("templates", "id"),
        Kind::Algorithms => ("algorithms", "id"),
        Kind::AlgorithmRevisions => ("algorithm_revisions", "id"),
        Kind::SettingsLearning => ("settings", "name"),
    }
}
