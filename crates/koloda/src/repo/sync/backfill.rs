//! Backfill: rows that predate enrollment reach the outbox as one imported snapshot, scanned in bounded batches
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Existing rows at enable time, §Backfill).

use koloda_sync_proto::hlc::{Hlc, HlcClock};
use koloda_sync_proto::payload::Payload;
use koloda_sync_proto::registry::{allow, Class, Kind};
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
use crate::repo::{algorithms, cards, decks, settings, templates};

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
}

// INVARIANT: referents come before the rows that name them, and ancestors before descendants
// (PROTOCOL.md, Existing rows at enable time).
const STEPS: [Step; 6] = [
    Step::Algorithms,
    Step::AlgorithmRevisions,
    Step::Templates,
    Step::Decks,
    Step::Cards,
    Step::Learning,
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
            Step::Learning => return None,
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

struct State {
    role: SpaceRole,
    create_hlc: Hlc,
    step: Option<Step>,
    after_id: Option<String>,
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
    let state = read_state(conn)?;
    let Some(mut step) = state.step else {
        return Ok(Backfill::Finished);
    };
    if max_envelopes == 0 {
        return Ok(Backfill::Pending);
    }

    let mut capture = Capture::begin_reserved(conn, state.create_hlc)?;
    let mut after_id = state.after_id;
    let mut budget = max_envelopes;
    let mut has_written = false;
    loop {
        let ids = candidates(conn, state.role, step, after_id.as_deref(), max_envelopes)?;
        let is_exhausted = ids.len() < max_envelopes;
        for id in ids {
            let payloads = entity_payloads(conn, step, &id)?;
            // INVARIANT: a batch never splits one entity's envelopes. An entity larger than the whole budget still
            // goes alone, so every batch advances the scan.
            if has_written && payloads.len() > budget {
                save_watermark(conn, Some(step), after_id.as_deref())?;
                return Ok(Backfill::Pending);
            }
            for payload in &payloads {
                capture.write_envelope(&id, None, payload)?;
            }
            budget = budget.saturating_sub(payloads.len());
            has_written |= !payloads.is_empty();
            after_id = Some(id);
            if budget == 0 {
                save_watermark(conn, Some(step), after_id.as_deref())?;
                return Ok(Backfill::Pending);
            }
        }

        if !is_exhausted {
            continue;
        }
        match step.next() {
            Some(next) => {
                step = next;
                after_id = None;
            }
            None => {
                save_watermark(conn, None, None)?;
                return Ok(Backfill::Finished);
            }
        }
    }
}

fn read_state(conn: &Connection) -> Result<State, AppError> {
    let row: Option<(String, i64, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT role, backfill_create_hlc, backfill_step, backfill_after_id FROM sync_state WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()?;
    let (role, create_hlc, step, after_id) =
        row.ok_or_else(|| protocol_error("only an enrolled database backfills"))?;

    Ok(State {
        role: SpaceRole::from_sql(&role)?,
        create_hlc: Hlc::from_raw(u64::try_from(create_hlc).map_err(protocol_error)?),
        step: step.as_deref().map(Step::from_sql).transpose()?,
        after_id,
    })
}

fn save_watermark(conn: &Connection, step: Option<Step>, after_id: Option<&str>) -> Result<(), AppError> {
    conn.execute(
        "UPDATE sync_state SET backfill_step = ?1, backfill_after_id = ?2 WHERE id = 1",
        params![step.map(Step::as_sql), after_id],
    )?;
    Ok(())
}

fn candidates(
    conn: &Connection,
    role: SpaceRole,
    step: Step,
    after_id: Option<&str>,
    limit: usize,
) -> Result<Vec<String>, AppError> {
    let Some(source) = step.source() else {
        let is_due = role == SpaceRole::Creator && after_id.is_none();
        return Ok(if is_due {
            vec![settings::LEARNING_SYNC_ID.to_string()]
        } else {
            Vec::new()
        });
    };

    let (table, _) = table(source.kind);
    let skip = match (role, source.joiner_skips) {
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
    let limit = i64::try_from(limit).map_err(protocol_error)?;
    let mut stmt = conn.prepare(&sql)?;
    let ids = match skip {
        Some((_, seed_id)) => stmt
            .query_map(params![after_id, kind, source.origin_group, limit, seed_id], |row| {
                row.get(0)
            })?
            .collect::<Result<Vec<String>, _>>()?,
        None => stmt
            .query_map(params![after_id, kind, source.origin_group, limit], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?,
    };
    Ok(ids)
}

fn entity_payloads(conn: &Connection, step: Step, id: &str) -> Result<Vec<Payload>, AppError> {
    let payloads = match step {
        Step::Algorithms => vec![algorithms::create_payload(conn, id)?],
        Step::AlgorithmRevisions => vec![Payload::AlgorithmRevision(algorithms::revision_payload(conn, id)?)],
        Step::Templates => vec![templates::create_payload(conn, id)?],
        Step::Decks => decks::create_payloads(conn, id)?.into(),
        Step::Cards => vec![cards::create_payload(conn, id)?],
        Step::Learning => learning_payloads(conn)?,
    };

    let mut unstamped = Vec::with_capacity(payloads.len());
    for payload in payloads {
        if !holds_register(conn, id, &payload)? {
            unstamped.push(payload);
        }
    }
    Ok(unstamped)
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
// stamp would demote that head.
fn holds_register(conn: &Connection, id: &str, payload: &Payload) -> Result<bool, AppError> {
    let (kind, group, op) = payload.target();
    let is_update = allow(kind, group, op)
        .map_err(protocol_error)?
        .is_some_and(|spec| spec.class == Class::Update);
    let Some(group) = group.filter(|_| is_update) else {
        return Ok(false);
    };

    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sync_stamps WHERE kind = ?1 AND id = ?2 AND group_name = ?3)",
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
    for payload in entity_payloads(conn, step, id)? {
        capture.write_envelope(id, None, &payload)?;
    }
    Ok(())
}
