//! Remote apply: envelopes other devices captured, one pull page per transaction
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Field groups and merge, Apply rule).
//!
//! Apply writes product rows with its own SQL and never calls repo write paths: those capture, and a remote
//! write must not re-enter the outbox. Repairs of dead pointers (`repair`) are the exception and publish.

use koloda_sync_proto::envelope::{Envelope, Header};
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::payload::{
    AlgorithmRevision, CardCreate, CardScheduling, DeckCreate, DocumentCreate, Payload, Review,
};
use koloda_sync_proto::registry::{allow, check_lane, Class, Group, Kind, Lane};
use rusqlite::{params, Connection, OptionalExtension, ToSql};
use serde_json::{Map, Value};
use uuid::Uuid;

use super::attachments;
use super::repair::{self, tombstone_successor, Starter};
use super::{delete_empty_cohort, forget_entity, protocol_error, Changed, StampValues, ROW_GROUP};
use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::domain::cards::CardState;
use crate::domain::reviews::InsertReviewData;
use crate::domain::seed_ids::{SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID};
use crate::repo::reviews::insert_review;

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

const SCHEDULING_GROUP: &str = "scheduling";
const RESET_GROUP: &str = "reset";

struct Entry {
    header: Header,
    payload: Payload,
    values: StampValues,
}

/// Applies one page and returns the kinds whose product rows it changed.
pub fn apply_page(db: &Database, page: &Page, starter: &Starter) -> Result<Vec<Kind>, AppError> {
    apply_entries(db, page.lane, &page.entries, starter, |tx| {
        let cursor = match page.lane {
            Lane::Hot => "cursor_hot",
            Lane::Cold => "cursor_cold",
        };
        tx.execute(
            &format!("UPDATE sync_state SET {cursor} = ?1 WHERE id = 1"),
            params![page.scanned_through],
        )?;
        Ok(())
    })
}

/// Applies one page of a bootstrap snapshot by the apply rule and leaves both cursors alone: a snapshot page is a
/// stream position, not a lane seq (`PROTOCOL.md` §Bootstrap).
pub fn apply_snapshot_page(
    db: &Database,
    lane: Lane,
    entries: &[PageEntry],
    starter: &Starter,
) -> Result<Vec<Kind>, AppError> {
    apply_entries(db, lane, entries, starter, |_| Ok(()))
}

/// Ends a bootstrap: `cold` resumes from the lease's cold head, and the next cycle pulls incrementally.
///
/// INVARIANT: call it once both snapshots and the `hot` catch-up are applied; `hot`'s cursor is already the
/// catch-up's `scanned_through`.
pub fn finish_bootstrap(db: &Database, cursor_cold: u64) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_conn(|conn| {
            conn.execute(
                "UPDATE sync_state SET cursor_cold = ?1, is_bootstrapping = 0 WHERE id = 1",
                params![cursor_cold],
            )?;
            Ok(())
        })
    })
}

fn apply_entries(
    db: &Database,
    lane: Lane,
    entries: &[PageEntry],
    starter: &Starter,
    after: impl FnOnce(&Connection) -> Result<(), AppError>,
) -> Result<Vec<Kind>, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        // INVARIANT: decode the whole page before writing. An entry that does not decode fails the page, so the
        // cursor never moves past an envelope that was not applied.
        let entries = entries
            .iter()
            .map(|entry| decode(lane, entry))
            .collect::<Result<Vec<_>, _>>()?;

        db.with_transaction(|tx| {
            require_enrolled(tx)?;
            let mut changed = Changed::default();
            for entry in &entries {
                observe(tx, entry.header.stamp.hlc)?;
                apply_entry(tx, entry, starter, &mut changed)?;
            }
            after(tx)?;
            Ok(changed.0)
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

fn require_enrolled(conn: &Connection) -> Result<(), AppError> {
    let is_enrolled: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sync_state WHERE id = 1 AND join_phase = 'active')",
        [],
        |row| row.get(0),
    )?;
    if is_enrolled {
        Ok(())
    } else {
        Err(protocol_error(
            "only an active enrolled database applies sync envelopes",
        ))
    }
}

// INVARIANT: the clock adopts each stamp before its entry applies, never after the page, so a repair that the entry
// triggers captures a stamp above it (PROTOCOL.md, Hybrid logical clock). The stable high-water keeps it even after
// a local write replaces it in its register, so a re-stamp never lands below it.
fn observe(conn: &Connection, hlc: Hlc) -> Result<(), AppError> {
    let raw = i64::try_from(hlc.raw()).map_err(protocol_error)?;
    conn.execute(
        "UPDATE sync_state SET last_hlc = MAX(last_hlc, ?1), stable_hlc = MAX(stable_hlc, ?1) WHERE id = 1",
        params![raw],
    )?;
    Ok(())
}

fn apply_entry(conn: &Connection, entry: &Entry, starter: &Starter, changed: &mut Changed) -> Result<(), AppError> {
    let header = &entry.header;
    if is_dead(conn, header)? {
        return Ok(());
    }
    if let Some((kind, successor)) = dead_referent(conn, header)? {
        return apply_on_dead_referent(conn, entry, kind, successor.as_deref(), starter, changed);
    }
    if !has_referents(conn, header)? {
        return Ok(());
    }

    let class = allow(header.kind, header.group, header.op)
        .map_err(protocol_error)?
        .map(|spec| spec.class);
    match class {
        Some(Class::Create) => apply_create(conn, entry, starter, changed),
        Some(Class::Update) => apply_update(conn, entry, changed),
        Some(Class::Immutable) => apply_immutable(conn, entry, changed),
        None => apply_delete(conn, entry, starter, changed),
    }
}

/// The first hard ref that names a tombstoned algorithm or template, with that tombstone's `successor`.
fn dead_referent(conn: &Connection, header: &Header) -> Result<Option<(Kind, Option<String>)>, AppError> {
    let refs = [
        header.refs.algorithm_id.as_deref().map(|id| (Kind::Algorithms, id)),
        header.refs.template_id.as_deref().map(|id| (Kind::Templates, id)),
    ];
    for (kind, id) in refs.into_iter().flatten() {
        let is_fenced: bool = conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM sync_tombstones WHERE kind = ?1 AND id = ?2)",
            params![kind.as_wire(), id],
            |row| row.get(0),
        )?;
        if is_fenced {
            return Ok(Some((kind, tombstone_successor(conn, kind, id)?)));
        }
    }
    Ok(None)
}

// INVARIANT: an envelope that names a tombstoned referent never writes it (PROTOCOL.md, Arrivals). A pointer that
// would win its register is repaired to the referent's repair target instead; a card create under a dead template
// is dropped, as the server already fenced it.
fn apply_on_dead_referent(
    conn: &Connection,
    entry: &Entry,
    kind: Kind,
    successor: Option<&str>,
    starter: &Starter,
    changed: &mut Changed,
) -> Result<(), AppError> {
    let header = &entry.header;
    let Some(group) = header
        .group
        .filter(|group| {
            matches!(
                group,
                Group::Algorithm | Group::Template | Group::DefaultsAlgorithm | Group::DefaultsTemplate
            )
        })
        .map(|group| group.as_wire())
    else {
        return Ok(());
    };
    if is_present(conn, header.kind, &header.id)? && beats_register(conn, header.kind, &header.id, group, header.stamp)?
    {
        repair::repoint(conn, header.kind, &header.id, kind, successor, starter, changed)?;
    }
    Ok(())
}

// INVARIANT: a tombstone is terminal. No envelope for a fenced entity, or for a child of a fenced parent, applies
// whatever its stamp (apply rule step 1). A review under a dead card's dead deck meets an absent card in step 3.
fn is_dead(conn: &Connection, header: &Header) -> Result<bool, AppError> {
    let parent = header.kind.spec().parent.zip(header.parent.as_deref());
    for (kind, id) in std::iter::once((header.kind, header.id.as_str())).chain(parent) {
        let is_fenced: bool = conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM sync_tombstones WHERE kind = ?1 AND id = ?2)",
            params![kind.as_wire(), id],
            |row| row.get(0),
        )?;
        if is_fenced {
            return Ok(true);
        }
    }
    Ok(false)
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

fn apply_create(conn: &Connection, entry: &Entry, starter: &Starter, changed: &mut Changed) -> Result<(), AppError> {
    let kind = entry.header.kind;
    let id = entry.header.id.as_str();
    if is_present(conn, kind, id)? && !is_stamp_zero_seed(conn, kind, id)? {
        return mark_seen(conn, kind, id);
    }

    match &entry.payload {
        Payload::CardCreate(create) => insert_card(conn, id, create)?,
        Payload::DeckCreate(create) => insert_deck(conn, id, create, starter, changed)?,
        Payload::TemplateCreate(create) => upsert_document(conn, Kind::Templates, id, create)?,
        Payload::AlgorithmCreate(create) => upsert_document(conn, Kind::Algorithms, id, create)?,
        _ => return Err(protocol_error("a create group carries a create payload")),
    }
    entry.values.write_create(conn, kind, id, &entry.payload)?;
    mark_seen(conn, kind, id)?;
    refresh_updated_at(conn, kind, id)?;
    attachments::queue_fetches(conn, &entry.header.refs.attachment_ids)?;

    changed.mark(kind);
    Ok(())
}

// INVARIANT: while a re-bootstrap's barrier is open, every create the server still holds marks its origin, the
// duplicates the apply rule drops included. A create left unmarked is absent on the server (PROTOCOL.md,
// Re-bootstrap).
fn mark_seen(conn: &Connection, kind: Kind, id: &str) -> Result<(), AppError> {
    conn.execute(
        r#"
        UPDATE sync_origins SET seen_generation = (SELECT rebase_generation FROM sync_state WHERE id = 1)
        WHERE kind = ?1 AND id = ?2 AND group_name = 'create'
          AND EXISTS (SELECT 1 FROM sync_state WHERE id = 1 AND is_rebasing = 1)
        "#,
        params![kind.as_wire(), id],
    )?;
    Ok(())
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

// INVARIANT: a deck create carries no pointers, but the local foreign keys need real rows. The placeholders are
// each kind's repair target and hold until the same-commit pointer groups overwrite them (PROTOCOL.md, Existence and
// order). They are never captured; a new default row the target creates is.
fn insert_deck(
    conn: &Connection,
    id: &str,
    create: &DeckCreate,
    starter: &Starter,
    changed: &mut Changed,
) -> Result<(), AppError> {
    let algorithm_id = repair::repair_target(conn, Kind::Algorithms, None, None, starter, changed)?;
    let template_id = repair::repair_target(conn, Kind::Templates, None, None, starter, changed)?;
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

// WHY: the conflict branch is the stamp-zero seed overlay; any other existing id never reaches here (`apply_create`).
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

fn apply_update(conn: &Connection, entry: &Entry, changed: &mut Changed) -> Result<(), AppError> {
    let kind = entry.header.kind;
    let id = entry.header.id.as_str();
    let group = entry
        .header
        .group
        .map(|group| group.as_wire())
        .ok_or_else(|| protocol_error("an update names a group"))?;
    if !is_present(conn, kind, id)? || !beats_register(conn, kind, id, group, entry.header.stamp)? {
        return Ok(());
    }

    write_group(conn, id, &entry.payload)?;
    entry
        .values
        .write_register(conn, kind, id, group, entry.payload.product_ts(), false)?;
    refresh_updated_at(conn, kind, id)?;
    discard_pending(conn, kind, id, group)?;
    attachments::queue_fetches(conn, &entry.header.refs.attachment_ids)?;
    if let Payload::CardReset(_) = &entry.payload {
        cut_off_at_reset(conn, id, entry, changed)?;
    }

    changed.mark(kind);
    Ok(())
}

// INVARIANT: a reset and its blank scheduling share one stamp, so one comparison decides both registers. The
// reset writes the blank scheduling itself in case its paired envelope has not arrived, and deletes every review
// that does not strictly beat it; a review this device never stamped counts as older (PROTOCOL.md, Reset progress).
fn cut_off_at_reset(conn: &Connection, card_id: &str, entry: &Entry, changed: &mut Changed) -> Result<(), AppError> {
    let reset = entry.header.stamp;
    if beats_register(conn, Kind::Cards, card_id, SCHEDULING_GROUP, reset)? {
        write_scheduling(conn, card_id, &blank_scheduling())?;
        entry
            .values
            .write_register(conn, Kind::Cards, card_id, SCHEDULING_GROUP, None, false)?;
        discard_pending(conn, Kind::Cards, card_id, SCHEDULING_GROUP)?;
    }

    let reviews: Vec<(String, Option<i64>, Option<Vec<u8>>)> = conn
        .prepare(
            r#"
            SELECT r.id, o.hlc, o.stamp_device
            FROM reviews r
            LEFT JOIN sync_origins o ON o.kind = 'reviews' AND o.id = r.id AND o.group_name = 'row'
            WHERE r.card_id = ?1
            "#,
        )?
        .query_map(params![card_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<_, _>>()?;
    for (review_id, hlc, device) in reviews {
        let does_survive = match hlc.zip(device) {
            Some((hlc, device)) => stored_stamp(hlc, &device)? > reset,
            None => false,
        };
        if does_survive {
            continue;
        }

        conn.execute("DELETE FROM reviews WHERE id = ?1", params![review_id])?;
        conn.execute(
            "DELETE FROM sync_origins WHERE kind = 'reviews' AND id = ?1",
            params![review_id],
        )?;
        discard_pending(conn, Kind::Reviews, &review_id, ROW_GROUP)?;
        changed.mark(Kind::Reviews);
    }
    Ok(())
}

fn blank_scheduling() -> CardScheduling {
    CardScheduling {
        state: i64::from(CardState::New.as_i32()),
        due_at: None,
        stability: 0.0,
        difficulty: 0.0,
        scheduled_days: 0,
        learning_steps: 0,
        reps: 0,
        lapses: 0,
        last_reviewed_at: None,
    }
}

struct Register {
    stamp: Stamp,
    is_synthetic: bool,
}

fn read_register(conn: &Connection, kind: Kind, id: &str, group: &str) -> Result<Option<Register>, AppError> {
    let register: Option<(i64, Vec<u8>, bool)> = conn
        .query_row(
            "SELECT hlc, stamp_device, synthetic FROM sync_stamps WHERE kind = ?1 AND id = ?2 AND group_name = ?3",
            params![kind.as_wire(), id, group],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    register
        .map(|(hlc, device, is_synthetic)| {
            Ok(Register {
                stamp: stored_stamp(hlc, &device)?,
                is_synthetic,
            })
        })
        .transpose()
}

// INVARIANT: an equal stamp wins only over a synthetic register, the floor a create wrote for its same-commit
// groups; after that, equal stamps do not beat (apply rule step 8). No register means a row this device never
// captured, which any stamp beats.
fn beats_register(conn: &Connection, kind: Kind, id: &str, group: &str, stamp: Stamp) -> Result<bool, AppError> {
    Ok(match read_register(conn, kind, id, group)? {
        Some(held) => stamp > held.stamp || (stamp == held.stamp && held.is_synthetic),
        None => true,
    })
}

// WHY: a create's synthetic reset register is a floor, not a reset; only a reset that really happened cuts off
// reviews (apply rule step 5).
fn survives_reset(conn: &Connection, card_id: &str, stamp: Stamp) -> Result<bool, AppError> {
    Ok(match read_register(conn, Kind::Cards, card_id, RESET_GROUP)? {
        Some(reset) if !reset.is_synthetic => stamp > reset.stamp,
        _ => true,
    })
}

fn stored_stamp(hlc: i64, device: &[u8]) -> Result<Stamp, AppError> {
    Ok(Stamp {
        hlc: Hlc::from_raw(u64::try_from(hlc).map_err(protocol_error)?),
        device: DeviceId(<[u8; 16]>::try_from(device).map_err(protocol_error)?),
    })
}

fn write_group(conn: &Connection, id: &str, payload: &Payload) -> Result<(), AppError> {
    let (sql, value): (&str, &dyn ToSql) = match payload {
        Payload::CardContent(group) => ("UPDATE cards SET content = ?1 WHERE id = ?2", &group.content),
        Payload::CardScheduling(scheduling) => return write_scheduling(conn, id, scheduling),
        // WHY: a reset has no product column of its own; its effects on scheduling and reviews run once its register
        // wins (`cut_off_at_reset`).
        Payload::CardReset(_) => return Ok(()),
        Payload::DeckTitle(group) => ("UPDATE decks SET title = ?1 WHERE id = ?2", &group.title),
        Payload::DeckNotes(group) => ("UPDATE decks SET notes = ?1 WHERE id = ?2", &group.notes),
        Payload::DeckAlgorithm(group) => ("UPDATE decks SET algorithm_id = ?1 WHERE id = ?2", &group.algorithm_id),
        Payload::DeckTemplate(group) => ("UPDATE decks SET template_id = ?1 WHERE id = ?2", &group.template_id),
        Payload::TemplateTitle(group) => ("UPDATE templates SET title = ?1 WHERE id = ?2", &group.title),
        Payload::TemplateNotes(group) => ("UPDATE templates SET notes = ?1 WHERE id = ?2", &group.notes),
        Payload::TemplateStructure(group) => ("UPDATE templates SET content = ?1 WHERE id = ?2", &group.content),
        Payload::AlgorithmTitle(group) => ("UPDATE algorithms SET title = ?1 WHERE id = ?2", &group.title),
        Payload::AlgorithmNotes(group) => ("UPDATE algorithms SET notes = ?1 WHERE id = ?2", &group.notes),
        // WHY: a remote parameter change records no local revision; the writer's revision arrives as its own
        // envelope (PROTOCOL.md, Groups).
        Payload::AlgorithmContent(group) => ("UPDATE algorithms SET content = ?1 WHERE id = ?2", &group.content),
        Payload::LearningDefaultAlgorithm(_)
        | Payload::LearningDefaultTemplate(_)
        | Payload::LearningDailyLimits(_)
        | Payload::LearningDayStartsAt(_)
        | Payload::LearningLearnAheadLimit(_) => return patch_learning(conn, id, payload),
        _ => return Err(protocol_error("an update group carries an update payload")),
    };
    conn.execute(sql, params![value, id])?;
    Ok(())
}

fn write_scheduling(conn: &Connection, id: &str, scheduling: &CardScheduling) -> Result<(), AppError> {
    conn.execute(
        r#"
        UPDATE cards
        SET state = ?1, due_at = ?2, stability = ?3, difficulty = ?4, scheduled_days = ?5, learning_steps = ?6,
            reps = ?7, lapses = ?8, last_reviewed_at = ?9
        WHERE id = ?10
        "#,
        params![
            scheduling.state,
            scheduling.due_at,
            scheduling.stability,
            scheduling.difficulty,
            scheduling.scheduled_days,
            scheduling.learning_steps,
            scheduling.reps,
            scheduling.lapses,
            scheduling.last_reviewed_at,
            id
        ],
    )?;
    Ok(())
}

const DEFAULT_ALGORITHM_PATH: &[&str] = &["defaults", "algorithm"];
const DEFAULT_TEMPLATE_PATH: &[&str] = &["defaults", "template"];
const DAILY_LIMITS_PATH: &[&str] = &["dailyLimits"];
const DAY_STARTS_AT_PATH: &[&str] = &["dayStartsAt"];
const LEARN_AHEAD_LIMIT_PATH: &[&str] = &["learnAheadLimit"];

// INVARIANT: each learning key is its own register, so a remote group replaces only its key and leaves the
// rest of the stored document as this device holds it.
pub(super) fn patch_learning(conn: &Connection, id: &str, payload: &Payload) -> Result<(), AppError> {
    let (path, value): (&[&str], Value) = match payload {
        Payload::LearningDefaultAlgorithm(group) => (DEFAULT_ALGORITHM_PATH, Value::from(group.algorithm_id.as_str())),
        Payload::LearningDefaultTemplate(group) => (DEFAULT_TEMPLATE_PATH, Value::from(group.template_id.as_str())),
        Payload::LearningDailyLimits(group) => (DAILY_LIMITS_PATH, serde_json::from_str(&group.value)?),
        Payload::LearningDayStartsAt(group) => (DAY_STARTS_AT_PATH, serde_json::from_str(&group.value)?),
        Payload::LearningLearnAheadLimit(group) => (LEARN_AHEAD_LIMIT_PATH, serde_json::from_str(&group.value)?),
        _ => return Err(protocol_error("a learning group carries a learning payload")),
    };
    let content: String = conn.query_row("SELECT content FROM settings WHERE name = ?1", params![id], |row| {
        row.get(0)
    })?;
    let mut document: Value = serde_json::from_str(&content)?;

    let (key, parents) = path
        .split_last()
        .ok_or_else(|| protocol_error("a learning key has a path"))?;
    let mut node = &mut document;
    for parent in parents {
        node = node
            .as_object_mut()
            .ok_or_else(|| protocol_error("the learning document is an object"))?
            .entry(*parent)
            .or_insert_with(|| Value::Object(Map::new()));
    }
    node.as_object_mut()
        .ok_or_else(|| protocol_error("the learning document is an object"))?
        .insert((*key).to_string(), value);

    conn.execute(
        "UPDATE settings SET content = ?1 WHERE name = ?2",
        params![document.to_string(), id],
    )?;
    Ok(())
}

// INVARIANT: a remote write that wins its register replaces the pending local write for that group; pushing it
// would republish a value under a losing stamp (apply rule step 9). An in-flight row stays until its outcome.
fn discard_pending(conn: &Connection, kind: Kind, id: &str, group: &str) -> Result<(), AppError> {
    let commits: Vec<Vec<u8>> = conn
        .prepare("SELECT commit_id FROM sync_outbox WHERE kind = ?1 AND id = ?2 AND group_name = ?3 AND in_flight = 0")?
        .query_map(params![kind.as_wire(), id, group], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    conn.execute(
        "DELETE FROM sync_outbox WHERE kind = ?1 AND id = ?2 AND group_name = ?3 AND in_flight = 0",
        params![kind.as_wire(), id, group],
    )?;
    for commit_id in commits {
        delete_empty_cohort(conn, &commit_id)?;
    }
    Ok(())
}

fn apply_immutable(conn: &Connection, entry: &Entry, changed: &mut Changed) -> Result<(), AppError> {
    let kind = entry.header.kind;
    let id = entry.header.id.as_str();
    if is_present(conn, kind, id)? {
        return Ok(());
    }

    match &entry.payload {
        Payload::Review(review) => {
            if !survives_reset(conn, &review.card_id, entry.header.stamp)? {
                return Ok(());
            }
            let data = review_data(review)?;
            data.validate()?;
            insert_review(conn, &data, review.created_at, Some(id))?;
        }
        Payload::AlgorithmRevision(revision) => insert_algorithm_revision(conn, id, revision)?,
        _ => return Err(protocol_error("an immutable group carries an immutable payload")),
    }
    entry.values.write_origin(conn, kind, id, ROW_GROUP, None)?;

    changed.mark(kind);
    Ok(())
}

fn apply_delete(conn: &Connection, entry: &Entry, starter: &Starter, changed: &mut Changed) -> Result<(), AppError> {
    let Payload::Delete { delete, .. } = &entry.payload else {
        return Err(protocol_error("a delete carries a delete payload"));
    };
    delete_entity(
        conn,
        entry.header.kind,
        &entry.header.id,
        delete.successor.as_deref(),
        &entry.values,
        starter,
        changed,
    )
}

/// Tombstones an entity at `values` and deletes it with its descendants, as an applied remote delete does.
///
/// INVARIANT: the tombstone fences its id even when this device never held the entity, so a create that arrives
/// later is dropped (apply rule steps 1 and 4).
pub(super) fn delete_entity(
    conn: &Connection,
    kind: Kind,
    id: &str,
    successor: Option<&str>,
    values: &StampValues,
    starter: &Starter,
    changed: &mut Changed,
) -> Result<(), AppError> {
    values.write_tombstone(conn, kind, id, successor)?;
    if !is_present(conn, kind, id)? {
        return Ok(());
    }
    remove_entity(conn, kind, id, successor, starter, changed)
}

/// Deletes a present entity as an applied tombstone does, without recording one.
pub(super) fn remove_entity(
    conn: &Connection,
    kind: Kind,
    id: &str,
    successor: Option<&str>,
    starter: &Starter,
    changed: &mut Changed,
) -> Result<(), AppError> {
    // INVARIANT: a referent dies only after every pointer to it is repaired and every card on a dead template is
    // dropped; the local foreign keys refuse the delete otherwise (PROTOCOL.md, Referents are not parents).
    if matches!(kind, Kind::Templates | Kind::Algorithms) {
        repair::sweep_pointers(conn, kind, id, successor, starter, changed)?;
    }
    if kind == Kind::Templates {
        let cards: Vec<String> = conn
            .prepare("SELECT id FROM cards WHERE template_id = ?1")?
            .query_map(params![id], |row| row.get(0))?
            .collect::<Result<_, _>>()?;
        for card in cards {
            drop_entity(conn, Kind::Cards, &card, changed)?;
        }
    }

    drop_entity(conn, kind, id, changed)
}

/// Deletes an entity and its descendants with their registers, origins, and pending rows, and records no tombstone.
pub(super) fn drop_entity(conn: &Connection, kind: Kind, id: &str, changed: &mut Changed) -> Result<(), AppError> {
    drop_pending_subtree(conn, kind, id)?;
    forget_entity(conn, kind, id)?;
    delete_subtree(conn, kind, id, changed)
}

// WHY: pending local writes of a dead entity or its descendants would only come back fenced, so they are dropped
// with their cohorts in the transaction that kills them (PROTOCOL.md, Outbox). In-flight rows wait for their outcome.
fn drop_pending_subtree(conn: &Connection, kind: Kind, id: &str) -> Result<(), AppError> {
    let descendants = match kind {
        Kind::Decks => {
            r#"
            OR (kind = 'cards' AND id IN (SELECT id FROM cards WHERE deck_id = ?1))
            OR (kind = 'reviews' AND id IN (SELECT r.id FROM reviews r JOIN cards c ON c.id = r.card_id WHERE c.deck_id = ?1))
            "#
        }
        Kind::Cards => "OR (kind = 'reviews' AND id IN (SELECT id FROM reviews WHERE card_id = ?1))",
        _ => "",
    };
    let scope = format!(
        "in_flight = 0 AND ((kind = '{}' AND id = ?1) {descendants})",
        kind.as_wire()
    );

    let commits: Vec<Vec<u8>> = conn
        .prepare(&format!("SELECT DISTINCT commit_id FROM sync_outbox WHERE {scope}"))?
        .query_map(params![id], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    conn.execute(&format!("DELETE FROM sync_outbox WHERE {scope}"), params![id])?;
    for commit_id in commits {
        delete_empty_cohort(conn, &commit_id)?;
    }
    Ok(())
}

fn delete_subtree(conn: &Connection, kind: Kind, id: &str, changed: &mut Changed) -> Result<(), AppError> {
    let (reviews, cards) = match kind {
        Kind::Decks => (
            conn.execute(
                "DELETE FROM reviews WHERE card_id IN (SELECT id FROM cards WHERE deck_id = ?1)",
                params![id],
            )?,
            conn.execute("DELETE FROM cards WHERE deck_id = ?1", params![id])?,
        ),
        Kind::Cards => (conn.execute("DELETE FROM reviews WHERE card_id = ?1", params![id])?, 0),
        _ => (0, 0),
    };
    let (table, _) = table(kind);
    conn.execute(&format!("DELETE FROM {table} WHERE id = ?1"), params![id])?;

    changed.mark(kind);
    if cards > 0 {
        changed.mark(Kind::Cards);
    }
    if reviews > 0 {
        changed.mark(Kind::Reviews);
    }
    Ok(())
}

fn review_data(review: &Review) -> Result<InsertReviewData, AppError> {
    Ok(InsertReviewData {
        card_id: review.card_id.clone(),
        rating: i32::try_from(review.rating).map_err(protocol_error)?,
        state: i32::try_from(review.state).map_err(protocol_error)?,
        due_at: review.due_at,
        stability: review.stability,
        difficulty: review.difficulty,
        scheduled_days: i32::try_from(review.scheduled_days).map_err(protocol_error)?,
        learning_steps: i32::try_from(review.learning_steps).map_err(protocol_error)?,
        time: i32::try_from(review.time).map_err(protocol_error)?,
        is_ignored: review.is_ignored,
    })
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

pub(super) fn is_present(conn: &Connection, kind: Kind, id: &str) -> Result<bool, AppError> {
    let (table, key) = table(kind);
    let row = conn
        .query_row(&format!("SELECT 1 FROM {table} WHERE {key} = ?1"), params![id], |_| {
            Ok(())
        })
        .optional()?;
    Ok(row.is_some())
}

/// The product table and key column that hold each kind's rows; the learning document is a settings row.
pub(super) fn table(kind: Kind) -> (&'static str, &'static str) {
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
