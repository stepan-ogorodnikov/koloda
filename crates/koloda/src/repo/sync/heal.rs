//! Heal after a server restore: every write the restored server may lack goes out again, re-encoded from the row with
//! its stored stamp (`crates/koloda-sync-proto/PROTOCOL.md` §Server restore).
//!
//! A write is lacking when its `(sender, sender_seq)` is above that sender's cutoff; a sender with no cutoff counts as
//! 0. The scan runs in bounded batches, like backfill, and resumes from its step and the last id it enqueued.

use koloda_sync_proto::envelope::digest;
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use std::collections::HashSet;

use koloda_sync_proto::payload::{
    seal, CardContent, CardReset, DeckAlgorithm, DeckTemplate, Delete, InitialProductTs, JsonContent, Notes, Payload,
    Seal, Title,
};
use koloda_sync_proto::registry::{Class, Group, Kind};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use uuid::Uuid;

use super::apply::table;
use super::{protocol_error, CREATE_GROUP, ROW_GROUP};
use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::domain::settings::SettingsName;
use crate::repo::{algorithms, cards, decks, reviews, settings, templates};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Heal {
    Pending,
    Finished,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Step {
    Entities(Kind),
    Revisions,
    Learning,
    Reviews,
    Tombstones(Kind),
}

// INVARIANT: backfill order. Referents come before the rows that name them, and ancestors before descendants, so a
// device never gets `existence` for its own re-push. Tombstones come last: a delete of an id the server does not hold
// yet is accepted as a fence, so a create re-pushed later by another device stays dead (PROTOCOL.md, Server restore).
const STEPS: [Step; 11] = [
    Step::Entities(Kind::Algorithms),
    Step::Revisions,
    Step::Entities(Kind::Templates),
    Step::Entities(Kind::Decks),
    Step::Entities(Kind::Cards),
    Step::Learning,
    Step::Reviews,
    Step::Tombstones(Kind::Cards),
    Step::Tombstones(Kind::Decks),
    Step::Tombstones(Kind::Templates),
    Step::Tombstones(Kind::Algorithms),
];

const ABOVE_CUTOFF: &str =
    "x.sender_seq > COALESCE((SELECT c.last_seq FROM sync_heal_cutoffs c WHERE c.sender = x.sender), 0)";

impl Step {
    fn as_sql(self) -> String {
        match self {
            Step::Entities(kind) => kind.as_wire().to_string(),
            Step::Revisions => "algorithm_revisions".to_string(),
            Step::Learning => "learning".to_string(),
            Step::Reviews => "reviews".to_string(),
            Step::Tombstones(kind) => format!("tombstones.{}", kind.as_wire()),
        }
    }

    fn from_sql(value: &str) -> Result<Step, AppError> {
        STEPS
            .into_iter()
            .find(|step| step.as_sql() == value)
            .ok_or_else(|| protocol_error(format!("unknown heal step {value}")))
    }

    fn next(self) -> Option<Step> {
        STEPS.into_iter().skip_while(|step| *step != self).nth(1)
    }
}

/// Starts a heal for a restore that moved the space to `epoch`: stores the epoch, moves each cursor back to the
/// restored head, and restarts the scan from its first step.
///
/// INVARIANT: a restore that arrives during a heal only lowers the cutoffs. The writes the first restore lacked are
/// still lacking, and a sender the new restore does not list counts as 0 (PROTOCOL.md, Server restore).
pub fn begin_heal(
    db: &Database,
    epoch: Uuid,
    head_hot: u64,
    head_cold: u64,
    cutoffs: &[(Uuid, u64)],
) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_transaction(|tx| {
            let (is_healing, is_import_pending): (bool, bool) = tx.query_row(
                "SELECT heal_step IS NOT NULL, join_phase = 'import_pending' FROM sync_state WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            // WHY: a file waiting for Add or Replace holds no sync state to re-push; the claim cleared it, and Add
            // backfills from the rows.
            if is_import_pending {
                tx.execute(
                    "UPDATE sync_state SET epoch = ?1 WHERE id = 1",
                    params![epoch.as_bytes().as_slice()],
                )?;
                return Ok(());
            }
            if !is_healing {
                tx.execute("DELETE FROM sync_heal_cutoffs", [])?;
                for (sender, last_seq) in cutoffs {
                    tx.execute(
                        "INSERT INTO sync_heal_cutoffs (sender, last_seq) VALUES (?1, ?2)",
                        params![sender.as_bytes().as_slice(), to_sql(*last_seq)?],
                    )?;
                }
            } else {
                let stored: Vec<Vec<u8>> = tx
                    .prepare("SELECT sender FROM sync_heal_cutoffs")?
                    .query_map([], |row| row.get(0))?
                    .collect::<Result<_, _>>()?;
                for sender in stored {
                    match cutoffs
                        .iter()
                        .find(|(listed, _)| listed.as_bytes().as_slice() == sender)
                    {
                        Some((_, last_seq)) => tx.execute(
                            "UPDATE sync_heal_cutoffs SET last_seq = MIN(last_seq, ?2) WHERE sender = ?1",
                            params![sender, to_sql(*last_seq)?],
                        )?,
                        None => tx.execute("DELETE FROM sync_heal_cutoffs WHERE sender = ?1", params![sender])?,
                    };
                }
            }
            tx.execute(
                r#"
                UPDATE sync_state
                SET epoch = ?1, cursor_hot = MIN(cursor_hot, ?2), cursor_cold = MIN(cursor_cold, ?3),
                    heal_step = ?4, heal_after_id = NULL, is_checking_attachments = 1
                WHERE id = 1
                "#,
                params![
                    epoch.as_bytes().as_slice(),
                    to_sql(head_hot)?,
                    to_sql(head_cold)?,
                    STEPS[0].as_sql()
                ],
            )?;
            Ok(())
        })
    })
}

/// Enqueues the next batch of the heal scan: at most `max_envelopes`, and it stops once it holds `max_bytes`.
pub fn heal_batch(db: &Database, max_envelopes: usize, max_bytes: usize) -> Result<Heal, AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        db.with_transaction(|tx| run_batch(tx, max_envelopes, max_bytes))
    })
}

fn run_batch(conn: &Connection, max_envelopes: usize, max_bytes: usize) -> Result<Heal, AppError> {
    type State = (Vec<u8>, i64, Option<String>, Option<String>);
    let state: Option<State> = conn
        .query_row(
            r#"
            SELECT device_id, next_sender_seq, heal_step, heal_after_id
            FROM sync_state WHERE id = 1 AND join_phase = 'active'
            "#,
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()?;
    let (device, next_sender_seq, step, mut after) =
        state.ok_or_else(|| protocol_error("only an active enrolled database heals"))?;
    let Some(mut step) = step.as_deref().map(Step::from_sql).transpose()? else {
        return Ok(Heal::Finished);
    };
    if max_envelopes == 0 {
        return Ok(Heal::Pending);
    }

    let mut writer = Writer {
        conn,
        device: DeviceId(<[u8; 16]>::try_from(device.as_slice()).map_err(protocol_error)?),
        next_sender_seq,
        commit_id: *Uuid::new_v4().as_bytes(),
        top: None,
        moved: HashSet::new(),
    };
    let mut budget = max_envelopes;
    let mut bytes = 0;
    let mut has_written = false;
    loop {
        let ids = candidates(conn, step, after.as_deref(), max_envelopes)?;
        let is_exhausted = ids.len() < max_envelopes;
        for id in ids {
            let writes = writes(conn, step, &id)?;
            // INVARIANT: a batch never splits one entity's writes. An entity larger than the whole budget still goes
            // alone, so every batch advances the scan.
            if has_written && writes.len() > budget {
                return writer.finish(Some(step), after.as_ref());
            }
            for write in &writes {
                bytes += writer.write(write)?;
            }
            budget = budget.saturating_sub(writes.len());
            has_written |= !writes.is_empty();
            after = Some(id);
            if budget == 0 || bytes >= max_bytes {
                return writer.finish(Some(step), after.as_ref());
            }
        }

        if !is_exhausted {
            continue;
        }
        match step.next() {
            Some(next) => {
                step = next;
                after = None;
            }
            None => {
                writer.finish(None, None)?;
                conn.execute("DELETE FROM sync_heal_cutoffs", [])?;
                return Ok(Heal::Finished);
            }
        }
    }
}

fn candidates(conn: &Connection, step: Step, after: Option<&str>, limit: usize) -> Result<Vec<String>, AppError> {
    let limit = i64::try_from(limit).map_err(protocol_error)?;
    let sql = match step {
        Step::Entities(kind) => {
            let (table, _) = table(kind);
            format!(
                r#"
                SELECT t.id FROM {table} AS t
                WHERE (?1 IS NULL OR t.id > ?1)
                  AND (
                      EXISTS (
                          SELECT 1 FROM sync_origins x
                          WHERE x.kind = ?2 AND x.id = t.id AND x.group_name = '{CREATE_GROUP}' AND {ABOVE_CUTOFF}
                      )
                      OR EXISTS (
                          SELECT 1 FROM sync_stamps x
                          WHERE x.kind = ?2 AND x.id = t.id AND x.synthetic = 0 AND {ABOVE_CUTOFF}
                      )
                  )
                ORDER BY t.id
                LIMIT ?3
                "#
            )
        }
        Step::Revisions | Step::Reviews => {
            let kind = immutable_kind(step);
            let (table, _) = table(kind);
            format!(
                r#"
                SELECT t.id FROM {table} AS t
                JOIN sync_origins x ON x.kind = ?2 AND x.id = t.id AND x.group_name = '{ROW_GROUP}'
                WHERE (?1 IS NULL OR t.id > ?1) AND {ABOVE_CUTOFF}
                ORDER BY t.id
                LIMIT ?3
                "#
            )
        }
        Step::Learning => format!(
            r#"
            SELECT DISTINCT x.id FROM sync_stamps x
            WHERE (?1 IS NULL OR x.id > ?1) AND x.kind = ?2 AND x.synthetic = 0 AND {ABOVE_CUTOFF}
            ORDER BY x.id
            LIMIT ?3
            "#
        ),
        Step::Tombstones(_) => format!(
            r#"
            SELECT x.id FROM sync_tombstones x
            WHERE (?1 IS NULL OR x.id > ?1) AND x.kind = ?2 AND {ABOVE_CUTOFF}
            ORDER BY x.id
            LIMIT ?3
            "#
        ),
    };
    let ids = conn
        .prepare(&sql)?
        .query_map(params![after, step_kind(step).as_wire(), limit], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;
    Ok(ids)
}

fn step_kind(step: Step) -> Kind {
    match step {
        Step::Entities(kind) | Step::Tombstones(kind) => kind,
        Step::Learning => Kind::SettingsLearning,
        Step::Revisions | Step::Reviews => immutable_kind(step),
    }
}

fn immutable_kind(step: Step) -> Kind {
    if step == Step::Reviews {
        Kind::Reviews
    } else {
        Kind::AlgorithmRevisions
    }
}

/// Which row a write's stamp and sender live in: the one the re-push moves to its new sender and seq.
#[derive(Clone, Copy)]
enum Source {
    Origin(&'static str),
    Register(Group),
    Tombstone,
}

/// One write the restored server may lack, ready to seal: the stored stamp, the sender that pushed it, and the
/// payload re-encoded from the row.
struct Write {
    kind: Kind,
    id: String,
    parent: Option<String>,
    stamp: Stamp,
    sender: Vec<u8>,
    sender_seq: i64,
    source: Source,
    payload: Payload,
}

struct Stored {
    stamp: Stamp,
    sender: Vec<u8>,
    sender_seq: i64,
}

fn writes(conn: &Connection, step: Step, id: &str) -> Result<Vec<Write>, AppError> {
    let kind = step_kind(step);
    match step {
        Step::Entities(_) => entity_writes(conn, kind, id),
        Step::Revisions | Step::Reviews => {
            let Some((stored, _)) = above_origin(conn, kind, id, ROW_GROUP)? else {
                return Ok(Vec::new());
            };
            let payload = if kind == Kind::Reviews {
                Payload::Review(reviews::review_payload(conn, id)?)
            } else {
                Payload::AlgorithmRevision(algorithms::revision_payload(conn, id)?)
            };
            let parent = payload.parent().map(str::to_string);
            Ok(vec![Write::new(
                kind,
                id,
                parent,
                stored,
                Source::Origin(ROW_GROUP),
                payload,
            )])
        }
        Step::Learning => {
            let content: String = conn.query_row(
                "SELECT content FROM settings WHERE name = ?1",
                params![SettingsName::Learning.to_string()],
                |row| row.get(0),
            )?;
            let document: Value = serde_json::from_str(&content)?;
            let mut writes = Vec::new();
            for (group, stored, _) in above_registers(conn, kind, id)? {
                let payload = settings::learning_payloads(None, &document)
                    .into_iter()
                    .find(|payload| payload.target().1 == Some(group))
                    .ok_or_else(|| protocol_error(format!("learning holds no {}", group.as_wire())))?;
                writes.push(Write::new(kind, id, None, stored, Source::Register(group), payload));
            }
            Ok(writes)
        }
        Step::Tombstones(_) => {
            type Row = (i64, Vec<u8>, Vec<u8>, i64, Option<String>, Option<String>);
            let row: Option<Row> = conn
                .query_row(
                    r#"
                    SELECT hlc, stamp_device, sender, sender_seq, successor, parent FROM sync_tombstones
                    WHERE kind = ?1 AND id = ?2
                    "#,
                    params![kind.as_wire(), id],
                    |row| {
                        Ok((
                            row.get(0)?,
                            row.get(1)?,
                            row.get(2)?,
                            row.get(3)?,
                            row.get(4)?,
                            row.get(5)?,
                        ))
                    },
                )
                .optional()?;
            let Some((hlc, stamp_device, sender, sender_seq, successor, parent)) = row else {
                return Ok(Vec::new());
            };
            let stored = Stored {
                stamp: stored_stamp(hlc, &stamp_device)?,
                sender,
                sender_seq,
            };
            let payload = Payload::Delete {
                kind,
                delete: Delete { successor },
            };
            Ok(vec![Write::new(kind, id, parent, stored, Source::Tombstone, payload)])
        }
    }
}

fn entity_writes(conn: &Connection, kind: Kind, id: &str) -> Result<Vec<Write>, AppError> {
    let parent: Option<String> = match kind {
        Kind::Cards => Some(conn.query_row("SELECT deck_id FROM cards WHERE id = ?1", params![id], |row| row.get(0))?),
        _ => None,
    };
    let registers = above_registers(conn, kind, id)?;
    let mut writes = Vec::new();

    if let Some((stored, floor)) = above_origin(conn, kind, id, CREATE_GROUP)? {
        // WHY: a create re-encoded from the row carries current values, so its initial update timestamps are the
        // current ones, and the legacy floor is the one it was created with (PROTOCOL.md, Registers).
        let initial = product_timestamps(conn, kind, id)?;
        let mut payload = match kind {
            Kind::Algorithms => algorithms::create_payload(conn, id)?,
            Kind::Templates => templates::create_payload(conn, id)?,
            Kind::Decks => {
                let [create, _, _] = decks::create_payloads(conn, id)?;
                create
            }
            Kind::Cards => cards::create_payload(conn, id)?,
            other => return Err(protocol_error(format!("{other:?} has no create"))),
        };
        match &mut payload {
            Payload::CardCreate(create) => {
                create.initial_product_ts = initial;
                create.legacy_product_ts_floor = floor;
            }
            Payload::DeckCreate(create) => {
                create.initial_product_ts = initial;
                create.legacy_product_ts_floor = floor;
            }
            Payload::TemplateCreate(create) | Payload::AlgorithmCreate(create) => {
                create.initial_product_ts = initial;
                create.legacy_product_ts_floor = floor;
            }
            _ => return Err(protocol_error("a create payload")),
        }
        writes.push(Write::new(
            kind,
            id,
            parent.clone(),
            stored,
            Source::Origin(CREATE_GROUP),
            payload,
        ));
    }

    for spec in kind.spec().groups.iter().filter(|spec| spec.class == Class::Update) {
        let Some((group, stored, product_ts)) = registers.iter().find(|(group, _, _)| *group == spec.group) else {
            continue;
        };
        let payload = update_payload(conn, kind, id, *group, stored.stamp, *product_ts)?;
        let stored = Stored {
            stamp: stored.stamp,
            sender: stored.sender.clone(),
            sender_seq: stored.sender_seq,
        };
        writes.push(Write::new(
            kind,
            id,
            parent.clone(),
            stored,
            Source::Register(*group),
            payload,
        ));
    }
    Ok(writes)
}

fn above_origin(
    conn: &Connection,
    kind: Kind,
    id: &str,
    group: &str,
) -> Result<Option<(Stored, Option<i64>)>, AppError> {
    type Row = (i64, Vec<u8>, Vec<u8>, i64, Option<i64>);
    let row: Option<Row> = conn
        .query_row(
            &format!(
                r#"
                SELECT x.hlc, x.stamp_device, x.sender, x.sender_seq, x.legacy_product_ts_floor FROM sync_origins x
                WHERE x.kind = ?1 AND x.id = ?2 AND x.group_name = ?3 AND {ABOVE_CUTOFF}
                "#
            ),
            params![kind.as_wire(), id, group],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .optional()?;
    row.map(|(hlc, stamp_device, sender, sender_seq, floor)| {
        Ok((
            Stored {
                stamp: stored_stamp(hlc, &stamp_device)?,
                sender,
                sender_seq,
            },
            floor,
        ))
    })
    .transpose()
}

fn above_registers(conn: &Connection, kind: Kind, id: &str) -> Result<Vec<(Group, Stored, Option<i64>)>, AppError> {
    type Row = (String, i64, Vec<u8>, Vec<u8>, i64, Option<i64>);
    let rows: Vec<Row> = conn
        .prepare(&format!(
            r#"
            SELECT x.group_name, x.hlc, x.stamp_device, x.sender, x.sender_seq, x.product_ts FROM sync_stamps x
            WHERE x.kind = ?1 AND x.id = ?2 AND x.synthetic = 0 AND {ABOVE_CUTOFF}
            ORDER BY x.group_name
            "#
        ))?
        .query_map(params![kind.as_wire(), id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })?
        .collect::<Result<_, _>>()?;
    rows.into_iter()
        .map(|(group, hlc, stamp_device, sender, sender_seq, product_ts)| {
            Ok((
                Group::from_wire(&group).map_err(protocol_error)?,
                Stored {
                    stamp: stored_stamp(hlc, &stamp_device)?,
                    sender,
                    sender_seq,
                },
                product_ts,
            ))
        })
        .collect()
}

fn product_timestamps(conn: &Connection, kind: Kind, id: &str) -> Result<InitialProductTs, AppError> {
    let rows: Vec<(String, i64)> = conn
        .prepare(
            "SELECT group_name, product_ts FROM sync_stamps WHERE kind = ?1 AND id = ?2 AND product_ts IS NOT NULL",
        )?
        .query_map(params![kind.as_wire(), id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    Ok(rows.into_iter().collect())
}

fn update_payload(
    conn: &Connection,
    kind: Kind,
    id: &str,
    group: Group,
    stamp: Stamp,
    product_ts: Option<i64>,
) -> Result<Payload, AppError> {
    let text = |sql: &str| -> Result<String, AppError> { Ok(conn.query_row(sql, params![id], |row| row.get(0))?) };
    let notes =
        |sql: &str| -> Result<Option<String>, AppError> { Ok(conn.query_row(sql, params![id], |row| row.get(0))?) };
    let title = |table: &str| -> Result<Title, AppError> {
        Ok(Title {
            title: text(&format!("SELECT title FROM {table} WHERE id = ?1"))?,
            updated_at: product_ts,
        })
    };
    let note = |table: &str| -> Result<Notes, AppError> {
        Ok(Notes {
            notes: notes(&format!("SELECT notes FROM {table} WHERE id = ?1"))?,
            updated_at: product_ts,
        })
    };
    let content = |table: &str| -> Result<JsonContent, AppError> {
        Ok(JsonContent {
            content: text(&format!("SELECT content FROM {table} WHERE id = ?1"))?,
            updated_at: product_ts,
        })
    };

    let payload = match (kind, group) {
        (Kind::Cards, Group::Content) => Payload::CardContent(CardContent {
            content: text("SELECT content FROM cards WHERE id = ?1")?,
            updated_at: product_ts,
        }),
        (Kind::Cards, Group::Scheduling) => {
            let card = cards::select_card(conn, id)?.ok_or_else(|| protocol_error("a healed card exists"))?;
            Payload::CardScheduling(cards::scheduling_payload(&card))
        }
        // WHY: no column keeps a reset's wall time; the display time of a reset that is not stored comes from its
        // stamp's wall part, as for a reset applied from its header (PROTOCOL.md, Corrupt envelopes).
        (Kind::Cards, Group::Reset) => Payload::CardReset(CardReset {
            wall_ms: i64::try_from(stamp.hlc.wall_ms()).map_err(protocol_error)?,
        }),
        (Kind::Decks, Group::Title) => Payload::DeckTitle(title("decks")?),
        (Kind::Decks, Group::Notes) => Payload::DeckNotes(note("decks")?),
        (Kind::Decks, Group::Algorithm) => Payload::DeckAlgorithm(DeckAlgorithm {
            algorithm_id: text("SELECT algorithm_id FROM decks WHERE id = ?1")?,
            updated_at: product_ts,
        }),
        (Kind::Decks, Group::Template) => Payload::DeckTemplate(DeckTemplate {
            template_id: text("SELECT template_id FROM decks WHERE id = ?1")?,
            updated_at: product_ts,
        }),
        (Kind::Templates, Group::Title) => Payload::TemplateTitle(title("templates")?),
        (Kind::Templates, Group::Notes) => Payload::TemplateNotes(note("templates")?),
        (Kind::Templates, Group::Structure) => Payload::TemplateStructure(content("templates")?),
        (Kind::Algorithms, Group::Title) => Payload::AlgorithmTitle(title("algorithms")?),
        (Kind::Algorithms, Group::Notes) => Payload::AlgorithmNotes(note("algorithms")?),
        (Kind::Algorithms, Group::Content) => Payload::AlgorithmContent(content("algorithms")?),
        (kind, group) => {
            return Err(protocol_error(format!(
                "{kind:?} has no update group {}",
                group.as_wire()
            )))
        }
    };
    Ok(payload)
}

impl Write {
    fn new(kind: Kind, id: &str, parent: Option<String>, stored: Stored, source: Source, payload: Payload) -> Write {
        Write {
            kind,
            id: id.to_string(),
            parent,
            stamp: stored.stamp,
            sender: stored.sender,
            sender_seq: stored.sender_seq,
            source,
            payload,
        }
    }
}

/// Seals a batch's writes into one `fixed` cohort at new seqs of this device.
struct Writer<'c> {
    conn: &'c Connection,
    device: DeviceId,
    next_sender_seq: i64,
    commit_id: [u8; 16],
    top: Option<Stamp>,
    /// Seqs this batch moved to the tail; another member of a moved cohort is already waiting there.
    moved: HashSet<i64>,
}

impl Writer<'_> {
    /// Returns the bytes the write added to the outbox.
    fn write(&mut self, write: &Write) -> Result<usize, AppError> {
        if write.sender.as_slice() == self.device.0.as_slice() {
            if self.moved.contains(&write.sender_seq) {
                return Ok(0);
            }
            let pending: Option<(bool, Vec<u8>)> = self
                .conn
                .query_row(
                    "SELECT in_flight, commit_id FROM sync_outbox WHERE sender_seq = ?1",
                    params![write.sender_seq],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?;
            // WHY: a write still waiting in the outbox goes out as it is, but behind the re-pushed rows it may name.
            // Pushed first, an edit of an entity whose create the backup lacks would come back `existence` once the
            // scan had passed that entity, and be lost. Its whole cohort moves, so the cohort is never split.
            if let Some((false, commit_id)) = pending {
                return self.move_cohort(&commit_id);
            }
        }

        let sealed = seal(
            Seal {
                id: write.id.clone(),
                parent: write.parent.clone(),
                stamp: write.stamp,
                commit_id: self.commit_id,
            },
            &write.payload,
        )
        .map_err(protocol_error)?;
        let sender_seq = self.take_seq();
        let group_name = write.payload.target().1.map(Group::as_wire);
        self.conn.execute(
            r#"
            INSERT INTO sync_outbox (sender_seq, kind, id, group_name, commit_id, envelope, digest, in_flight)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)
            "#,
            params![
                sender_seq,
                write.kind.as_wire(),
                write.id,
                group_name,
                self.commit_id.as_slice(),
                sealed.bytes,
                digest(&sealed.bytes).0.as_slice()
            ],
        )?;

        // INVARIANT: the row the write lives in takes the re-push's sender and seq, and keeps its stamp. A consumed
        // seq then means the write, or a newer one, is in any later backup, so another restore's cutoff test stays
        // exact.
        let device = self.device.0.as_slice();
        let (kind, id) = (write.kind.as_wire(), write.id.as_str());
        match write.source {
            Source::Origin(group) => self.conn.execute(
                "UPDATE sync_origins SET sender = ?1, sender_seq = ?2 WHERE kind = ?3 AND id = ?4 AND group_name = ?5",
                params![device, sender_seq, kind, id, group],
            )?,
            Source::Register(group) => self.conn.execute(
                "UPDATE sync_stamps SET sender = ?1, sender_seq = ?2 WHERE kind = ?3 AND id = ?4 AND group_name = ?5",
                params![device, sender_seq, kind, id, group.as_wire()],
            )?,
            Source::Tombstone => self.conn.execute(
                "UPDATE sync_tombstones SET sender = ?1, sender_seq = ?2 WHERE kind = ?3 AND id = ?4",
                params![device, sender_seq, kind, id],
            )?,
        };

        if self.top.is_none_or(|top| write.stamp > top) {
            self.top = Some(write.stamp);
        }
        Ok(sealed.bytes.len())
    }

    fn move_cohort(&mut self, commit_id: &[u8]) -> Result<usize, AppError> {
        let rows: Vec<(i64, usize)> = self
            .conn
            .prepare(
                r#"
                SELECT sender_seq, length(envelope) FROM sync_outbox
                WHERE commit_id = ?1 AND in_flight = 0
                ORDER BY sender_seq
                "#,
            )?
            .query_map(params![commit_id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<_, _>>()?;
        let mut bytes = 0;
        for (old_seq, size) in rows {
            let new_seq = self.take_seq();
            self.moved.insert(old_seq);
            self.conn.execute(
                "UPDATE sync_outbox SET sender_seq = ?2 WHERE sender_seq = ?1",
                params![old_seq, new_seq],
            )?;
            for table in ["sync_stamps", "sync_origins", "sync_tombstones"] {
                self.conn.execute(
                    &format!("UPDATE {table} SET sender_seq = ?3 WHERE sender = ?1 AND sender_seq = ?2"),
                    params![self.device.0.as_slice(), old_seq, new_seq],
                )?;
            }
            bytes += size;
        }
        Ok(bytes)
    }

    fn take_seq(&mut self) -> i64 {
        let sender_seq = self.next_sender_seq;
        self.next_sender_seq += 1;
        sender_seq
    }

    // INVARIANT: a heal batch is one cohort, `fixed` and marked consumed, so neither a clock re-stamp nor a fork's
    // switch ever gives a re-pushed write a new stamp (PROTOCOL.md, Server restore).
    fn finish(self, step: Option<Step>, after: Option<&String>) -> Result<Heal, AppError> {
        if let Some(top) = self.top {
            self.conn.execute(
                r#"
                INSERT INTO sync_cohorts (commit_id, state, hlc, stamp_device, has_consumed)
                VALUES (?1, 'fixed', ?2, ?3, 1)
                "#,
                params![
                    self.commit_id.as_slice(),
                    i64::try_from(top.hlc.raw()).map_err(protocol_error)?,
                    top.device.0.as_slice()
                ],
            )?;
        }
        self.conn.execute(
            "UPDATE sync_state SET next_sender_seq = ?1, heal_step = ?2, heal_after_id = ?3 WHERE id = 1",
            params![self.next_sender_seq, step.map(Step::as_sql), after],
        )?;
        Ok(if step.is_some() { Heal::Pending } else { Heal::Finished })
    }
}

fn stored_stamp(hlc: i64, device: &[u8]) -> Result<Stamp, AppError> {
    Ok(Stamp {
        hlc: Hlc::from_raw(u64::try_from(hlc).map_err(protocol_error)?),
        device: DeviceId(<[u8; 16]>::try_from(device).map_err(protocol_error)?),
    })
}

fn to_sql(value: u64) -> Result<i64, AppError> {
    i64::try_from(value).map_err(protocol_error)
}
