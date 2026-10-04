//! Backfill: rows that predate enrollment reach the outbox as one imported snapshot, scanned in bounded batches
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Existing rows at enable time, §Backfill).

use koloda_sync_proto::hlc::{Hlc, HlcClock};
use koloda_sync_proto::payload::Payload;
use koloda_sync_proto::registry::{allow, Class, Group, Kind};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use super::apply::{is_present, table};
use super::capture::Capture;
use super::{protocol_error, SpaceRole, CREATE_GROUP, ROW_GROUP};
use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::app::utility::get_current_timestamp;
use crate::domain::seed_ids::{SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID};
use crate::domain::settings::SettingsName;
use crate::repo::{algorithms, cards, decks, reviews, settings, templates};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Backfill {
    Pending,
    Finished,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Step {
    Algorithms,
    AlgorithmRevisions,
    Templates,
    Decks,
    Cards,
    Learning,
    Reviews,
    Scheduling,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Phase {
    Create,
    Review,
    Scheduling,
}

// INVARIANT: referents come before the rows that name them, and ancestors before descendants. Reviews then come
// before the scheduling snapshots, which must sort after them (PROTOCOL.md, Existing rows at enable time).
const STEPS: [Step; 8] = [
    Step::Algorithms,
    Step::AlgorithmRevisions,
    Step::Templates,
    Step::Decks,
    Step::Cards,
    Step::Learning,
    Step::Reviews,
    Step::Scheduling,
];

impl Step {
    fn as_sql(self) -> &'static str {
        match self {
            Step::Algorithms => "algorithms",
            Step::AlgorithmRevisions => "algorithm_revisions",
            Step::Templates => "templates",
            Step::Decks => "decks",
            Step::Cards => "cards",
            Step::Learning => "learning",
            Step::Reviews => "reviews",
            Step::Scheduling => "scheduling",
        }
    }

    fn from_sql(value: &str) -> Result<Step, AppError> {
        STEPS
            .into_iter()
            .find(|step| step.as_sql() == value)
            .ok_or_else(|| protocol_error(format!("unknown backfill step {value}")))
    }

    fn next(self) -> Option<Step> {
        STEPS.into_iter().skip_while(|step| *step != self).nth(1)
    }

    fn phase(self) -> Phase {
        match self {
            Step::Reviews => Phase::Review,
            Step::Scheduling => Phase::Scheduling,
            _ => Phase::Create,
        }
    }

    fn source(self) -> Option<Source> {
        let (kind, origin_group, joiner_skips) = match self {
            Step::Algorithms => (Kind::Algorithms, CREATE_GROUP, Some(("id", SEED_ALGORITHM_SIMPLE_ID))),
            // WHY: a join deletes the seed algorithm's local revisions and takes the space's history instead.
            Step::AlgorithmRevisions => (
                Kind::AlgorithmRevisions,
                ROW_GROUP,
                Some(("algorithm_id", SEED_ALGORITHM_SIMPLE_ID)),
            ),
            Step::Templates => (Kind::Templates, CREATE_GROUP, Some(("id", SEED_TEMPLATE_TYPE_ID))),
            Step::Decks => (Kind::Decks, CREATE_GROUP, None),
            Step::Cards => (Kind::Cards, CREATE_GROUP, None),
            Step::Learning | Step::Reviews | Step::Scheduling => return None,
        };
        Some(Source {
            kind,
            origin_group,
            joiner_skips,
        })
    }
}

struct Source {
    kind: Kind,
    origin_group: &'static str,
    joiner_skips: Option<(&'static str, &'static str)>,
}

/// A scan position: the last row enqueued, ordered by `(created_at, id)` for reviews and by id otherwise.
struct Mark {
    created_at: Option<i64>,
    id: String,
}

struct Entity {
    parent: Option<String>,
    payloads: Vec<Payload>,
}

struct State {
    role: SpaceRole,
    device: Vec<u8>,
    create_hlc: Hlc,
    review_hlc: Hlc,
    scheduling_hlc: Hlc,
    step: Option<Step>,
    after: Option<Mark>,
}

impl State {
    fn stamp(&self, phase: Phase) -> Hlc {
        match phase {
            Phase::Create => self.create_hlc,
            Phase::Review => self.review_hlc,
            Phase::Scheduling => self.scheduling_hlc,
        }
    }
}

pub(super) fn reserve(conn: &Connection) -> Result<(), AppError> {
    let last_hlc: i64 = conn.query_row("SELECT last_hlc FROM sync_state WHERE id = 1", [], |row| row.get(0))?;
    let mut clock = HlcClock {
        last: Hlc::from_raw(u64::try_from(last_hlc).map_err(protocol_error)?),
    };
    let now = u64::try_from(get_current_timestamp()?).map_err(protocol_error)?;
    let mut next_stamp = || -> Result<i64, AppError> {
        let hlc = clock.tick(now).map_err(protocol_error)?;
        i64::try_from(hlc.raw()).map_err(protocol_error)
    };
    let create = next_stamp()?;
    let review = next_stamp()?;
    let scheduling = next_stamp()?;

    conn.execute(
        r#"
        UPDATE sync_state
        SET last_hlc = ?3, backfill_create_hlc = ?1, backfill_review_hlc = ?2, backfill_scheduling_hlc = ?3,
            backfill_step = ?4, backfill_after_ts = NULL, backfill_after_id = NULL
        WHERE id = 1
        "#,
        params![create, review, scheduling, Step::Algorithms.as_sql()],
    )?;
    Ok(())
}

pub fn backfill_batch(db: &Database, max_envelopes: usize) -> Result<Backfill, AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        db.with_transaction(|tx| run_batch(tx, max_envelopes))
    })
}

fn run_batch(conn: &Connection, max_envelopes: usize) -> Result<Backfill, AppError> {
    let mut state = read_state(conn)?;
    let Some(mut step) = state.step else {
        return Ok(Backfill::Finished);
    };
    if max_envelopes == 0 {
        return Ok(Backfill::Pending);
    }

    let mut capture = Capture::begin_reserved(conn, state.stamp(step.phase()))?;
    let mut after = state.after.take();
    let mut budget = max_envelopes;
    let mut has_written = false;
    loop {
        let marks = candidates(conn, &state, step, after.as_ref(), max_envelopes)?;
        let is_exhausted = marks.len() < max_envelopes;
        for mark in marks {
            let entity = entity(conn, step, &mark.id)?;
            // INVARIANT: a batch never splits one entity's envelopes. An entity larger than the whole budget still
            // goes alone, so every batch advances the scan.
            if has_written && entity.payloads.len() > budget {
                save_watermark(conn, Some(step), after.as_ref())?;
                return Ok(Backfill::Pending);
            }
            for payload in &entity.payloads {
                capture.write_envelope(&mark.id, entity.parent.as_deref(), payload)?;
            }
            budget = budget.saturating_sub(entity.payloads.len());
            has_written |= !entity.payloads.is_empty();
            after = Some(mark);
            if budget == 0 {
                save_watermark(conn, Some(step), after.as_ref())?;
                return Ok(Backfill::Pending);
            }
        }

        if !is_exhausted {
            continue;
        }
        let Some(next) = step.next() else {
            save_watermark(conn, None, None)?;
            return Ok(Backfill::Finished);
        };
        // INVARIANT: one batch is one commit at one phase stamp, so a new phase starts a new batch.
        if next.phase() != step.phase() {
            if has_written {
                save_watermark(conn, Some(next), None)?;
                return Ok(Backfill::Pending);
            }
            capture = Capture::begin_reserved(conn, state.stamp(next.phase()))?;
        }
        step = next;
        after = None;
    }
}

fn read_state(conn: &Connection) -> Result<State, AppError> {
    type Row = (
        String,
        Vec<u8>,
        i64,
        i64,
        i64,
        Option<String>,
        Option<i64>,
        Option<String>,
    );
    let row: Option<Row> = conn
        .query_row(
            r#"
            SELECT role, device_id, backfill_create_hlc, backfill_review_hlc, backfill_scheduling_hlc,
                   backfill_step, backfill_after_ts, backfill_after_id
            FROM sync_state WHERE id = 1
            "#,
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                ))
            },
        )
        .optional()?;
    let (role, device, create_hlc, review_hlc, scheduling_hlc, step, after_ts, after_id) =
        row.ok_or_else(|| protocol_error("only an enrolled database backfills"))?;
    let hlc = |raw: i64| u64::try_from(raw).map(Hlc::from_raw).map_err(protocol_error);

    Ok(State {
        role: SpaceRole::from_sql(&role)?,
        device,
        create_hlc: hlc(create_hlc)?,
        review_hlc: hlc(review_hlc)?,
        scheduling_hlc: hlc(scheduling_hlc)?,
        step: step.as_deref().map(Step::from_sql).transpose()?,
        after: after_id.map(|id| Mark {
            created_at: after_ts,
            id,
        }),
    })
}

fn save_watermark(conn: &Connection, step: Option<Step>, after: Option<&Mark>) -> Result<(), AppError> {
    conn.execute(
        "UPDATE sync_state SET backfill_step = ?1, backfill_after_ts = ?2, backfill_after_id = ?3 WHERE id = 1",
        params![
            step.map(Step::as_sql),
            after.and_then(|mark| mark.created_at),
            after.map(|mark| mark.id.as_str())
        ],
    )?;
    Ok(())
}

fn candidates(
    conn: &Connection,
    state: &State,
    step: Step,
    after: Option<&Mark>,
    limit: usize,
) -> Result<Vec<Mark>, AppError> {
    let after_id = after.map(|mark| mark.id.as_str());
    let limit = i64::try_from(limit).map_err(protocol_error)?;
    let by_id = |row: &rusqlite::Row<'_>| {
        Ok(Mark {
            created_at: None,
            id: row.get(0)?,
        })
    };

    let marks = match step {
        Step::Learning => {
            let is_due = state.role == SpaceRole::Creator && after.is_none();
            if is_due {
                vec![Mark {
                    created_at: None,
                    id: settings::LEARNING_SYNC_ID.to_string(),
                }]
            } else {
                Vec::new()
            }
        }
        Step::Reviews => conn
            .prepare(
                r#"
                SELECT r.id, r.created_at FROM reviews AS r
                WHERE (?1 IS NULL OR (r.created_at, r.id) > (?1, ?2))
                  AND NOT EXISTS (
                      SELECT 1 FROM sync_origins o WHERE o.kind = ?3 AND o.id = r.id AND o.group_name = ?4
                  )
                ORDER BY r.created_at, r.id
                LIMIT ?5
                "#,
            )?
            .query_map(
                params![
                    after.and_then(|mark| mark.created_at),
                    after_id,
                    Kind::Reviews.as_wire(),
                    ROW_GROUP,
                    limit
                ],
                |row| {
                    Ok(Mark {
                        id: row.get(0)?,
                        created_at: Some(row.get(1)?),
                    })
                },
            )?
            .collect::<Result<Vec<_>, _>>()?,
        // WHY: only a card whose scheduling register is still the synthetic floor of its phase-1 create gets a
        // snapshot. A card graded or reset since, here or remotely, already holds newer scheduling.
        Step::Scheduling => conn
            .prepare(
                r#"
                SELECT c.id FROM cards AS c
                JOIN sync_stamps AS s ON s.kind = ?2 AND s.id = c.id AND s.group_name = ?3
                WHERE (?1 IS NULL OR c.id > ?1)
                  AND s.synthetic = 1 AND s.hlc = ?4 AND s.stamp_device = ?5
                ORDER BY c.id
                LIMIT ?6
                "#,
            )?
            .query_map(
                params![
                    after_id,
                    Kind::Cards.as_wire(),
                    Group::Scheduling.as_wire(),
                    i64::try_from(state.create_hlc.raw()).map_err(protocol_error)?,
                    state.device,
                    limit
                ],
                by_id,
            )?
            .collect::<Result<Vec<_>, _>>()?,
        _ => {
            let source = step
                .source()
                .ok_or_else(|| protocol_error("a scanned step names its table"))?;
            let (table, _) = table(source.kind);
            let skip = match (state.role, source.joiner_skips) {
                (SpaceRole::Joiner, Some(skip)) => Some(skip),
                _ => None,
            };
            let skip_clause = skip.map_or(String::new(), |(column, _)| format!("AND t.{column} <> ?5"));
            let sql = format!(
                r#"
                SELECT t.id FROM {table} AS t
                WHERE (?1 IS NULL OR t.id > ?1)
                  AND NOT EXISTS (
                      SELECT 1 FROM sync_origins o WHERE o.kind = ?2 AND o.id = t.id AND o.group_name = ?3
                  )
                  {skip_clause}
                ORDER BY t.id
                LIMIT ?4
                "#
            );
            let kind = source.kind.as_wire();
            let mut stmt = conn.prepare(&sql)?;
            match skip {
                Some((_, seed_id)) => stmt
                    .query_map(params![after_id, kind, source.origin_group, limit, seed_id], by_id)?
                    .collect::<Result<Vec<_>, _>>()?,
                None => stmt
                    .query_map(params![after_id, kind, source.origin_group, limit], by_id)?
                    .collect::<Result<Vec<_>, _>>()?,
            }
        }
    };
    Ok(marks)
}

fn entity(conn: &Connection, step: Step, id: &str) -> Result<Entity, AppError> {
    let mut parent = None;
    let payloads = match step {
        Step::Algorithms => vec![algorithms::create_payload(conn, id)?],
        Step::AlgorithmRevisions => vec![Payload::AlgorithmRevision(algorithms::revision_payload(conn, id)?)],
        Step::Templates => vec![templates::create_payload(conn, id)?],
        Step::Decks => decks::create_payloads(conn, id)?.into(),
        Step::Cards => vec![cards::create_payload(conn, id)?],
        Step::Learning => learning_payloads(conn)?,
        Step::Reviews => vec![Payload::Review(reviews::review_payload(conn, id)?)],
        Step::Scheduling => {
            let card = cards::select_card(conn, id)?.ok_or_else(|| protocol_error("a scanned card exists"))?;
            parent = Some(card.deck_id.clone());
            vec![Payload::CardScheduling(cards::scheduling_payload(&card))]
        }
    };

    let mut unstamped = Vec::with_capacity(payloads.len());
    for payload in payloads {
        if !holds_head(conn, id, &payload)? {
            unstamped.push(payload);
        }
    }
    Ok(Entity {
        parent,
        payloads: unstamped,
    })
}

fn learning_payloads(conn: &Connection) -> Result<Vec<Payload>, AppError> {
    let content: Option<String> = conn
        .query_row(
            "SELECT content FROM settings WHERE name = ?1",
            params![SettingsName::Learning.to_string()],
            |row| row.get(0),
        )
        .optional()?;
    match content {
        Some(content) => Ok(settings::learning_payloads(
            None,
            &serde_json::from_str::<Value>(&content)?,
        )),
        None => Ok(Vec::new()),
    }
}

// WHY: a group written since enrollment already holds a newer head. Backfilling its value at the older reserved
// stamp would demote that head. A synthetic floor from the row's own create is not a head.
fn holds_head(conn: &Connection, id: &str, payload: &Payload) -> Result<bool, AppError> {
    let (kind, group, op) = payload.target();
    let is_update = allow(kind, group, op)
        .map_err(protocol_error)?
        .is_some_and(|spec| spec.class == Class::Update);
    let Some(group) = group.filter(|_| is_update) else {
        return Ok(false);
    };

    conn.query_row(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM sync_stamps WHERE kind = ?1 AND id = ?2 AND group_name = ?3 AND synthetic = 0
        )
        "#,
        params![kind.as_wire(), id, group.as_wire()],
        |row| row.get(0),
    )
    .map_err(AppError::from)
}

// INVARIANT: no envelope reaches the outbox before the rows it names. While backfill runs, a write that names an
// unstamped row backfills it first, in the same commit and in PROTOCOL.md §Backfill order: algorithms, templates,
// the parent chain from the root down, then the written entity itself. A delete never gets here: a tombstone for
// an id the server does not hold is accepted as a fence.
pub(super) fn touch(
    conn: &Connection,
    capture: &mut Capture<'_>,
    role: SpaceRole,
    id: &str,
    parent: Option<&str>,
    payload: &Payload,
) -> Result<(), AppError> {
    let (kind, group, op) = payload.target();
    let is_update = allow(kind, group, op)
        .map_err(protocol_error)?
        .is_some_and(|spec| spec.class == Class::Update);

    let mut chain = Vec::new();
    let mut next = if is_update {
        Some((kind, id.to_string()))
    } else {
        payload
            .parent()
            .or(parent)
            .zip(kind.spec().parent)
            .map(|(parent, parent_kind)| (parent_kind, parent.to_string()))
    };
    while let Some((kind, id)) = next {
        next = ancestor(conn, kind, &id)?;
        if needs_backfill(conn, role, kind, &id)? {
            chain.push((kind, id));
        }
    }

    let refs = payload.refs();
    let mut algorithms: Vec<String> = refs.algorithm_id.into_iter().collect();
    let mut templates: Vec<String> = refs.template_id.into_iter().collect();
    for (kind, id) in &chain {
        match kind {
            Kind::Decks => {
                let (algorithm, template): (String, String) = conn.query_row(
                    "SELECT algorithm_id, template_id FROM decks WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )?;
                algorithms.push(algorithm);
                templates.push(template);
            }
            Kind::Cards => {
                templates.push(
                    conn.query_row("SELECT template_id FROM cards WHERE id = ?1", params![id], |row| {
                        row.get(0)
                    })?,
                );
            }
            _ => {}
        }
    }

    let mut backfilled: Vec<(Kind, String)> = Vec::new();
    let referents = algorithms
        .into_iter()
        .map(|id| (Kind::Algorithms, id))
        .chain(templates.into_iter().map(|id| (Kind::Templates, id)));
    for (kind, id) in referents {
        if !backfilled.contains(&(kind, id.clone())) && needs_backfill(conn, role, kind, &id)? {
            backfill_entity(conn, capture, kind, &id)?;
            backfilled.push((kind, id));
        }
    }
    for (kind, id) in chain.iter().rev() {
        backfill_entity(conn, capture, *kind, id)?;
    }
    Ok(())
}

fn ancestor(conn: &Connection, kind: Kind, id: &str) -> Result<Option<(Kind, String)>, AppError> {
    if kind != Kind::Cards {
        return Ok(None);
    }
    let deck: Option<String> = conn
        .query_row("SELECT deck_id FROM cards WHERE id = ?1", params![id], |row| row.get(0))
        .optional()?;
    Ok(deck.map(|deck| (Kind::Decks, deck)))
}

fn needs_backfill(conn: &Connection, role: SpaceRole, kind: Kind, id: &str) -> Result<bool, AppError> {
    let has_create = kind.spec().groups.iter().any(|spec| spec.class == Class::Create);
    // WHY: a joiner's untouched seed row stays at stamp zero; the space already holds it (PROTOCOL.md, Seed identity).
    let is_joiner_seed = role == SpaceRole::Joiner
        && matches!(
            (kind, id),
            (Kind::Algorithms, SEED_ALGORITHM_SIMPLE_ID) | (Kind::Templates, SEED_TEMPLATE_TYPE_ID)
        );
    if !has_create || is_joiner_seed || !is_present(conn, kind, id)? {
        return Ok(false);
    }

    let is_stamped: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sync_origins WHERE kind = ?1 AND id = ?2 AND group_name = ?3)",
        params![kind.as_wire(), id, CREATE_GROUP],
        |row| row.get(0),
    )?;
    Ok(!is_stamped)
}

fn backfill_entity(conn: &Connection, capture: &mut Capture<'_>, kind: Kind, id: &str) -> Result<(), AppError> {
    let step = match kind {
        Kind::Algorithms => Step::Algorithms,
        Kind::Templates => Step::Templates,
        Kind::Decks => Step::Decks,
        Kind::Cards => Step::Cards,
        other => return Err(protocol_error(format!("{other:?} has no create to backfill"))),
    };
    let entity = entity(conn, step, id)?;
    for payload in &entity.payloads {
        capture.write_envelope(id, entity.parent.as_deref(), payload)?;
    }
    Ok(())
}
