//! Push batches and their outcomes (`crates/koloda-sync-proto/PROTOCOL.md` §Cohorts, §Outbox, §Push outcomes).
//!
//! A batch puts its rows in flight and its `local` cohorts in `uncertain`. Its reply, its loss, or its refusal then
//! settles every row it carried in one transaction.

use std::collections::HashSet;

use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::hlc::DeviceId;
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::{DependencyAction, HeldReason, Outcome, PushOutcome};
use rusqlite::{params, Connection, OptionalExtension};

use super::apply::{delete_entity, drop_entity};
use super::attachments;
use super::repair::Starter;
use super::{protocol_error, Changed, StampValues};
use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};

/// Outbox rows in ascending `sender_seq`, whole cohorts only.
pub struct Batch {
    pub items: Vec<BatchItem>,
}

pub struct BatchItem {
    pub sender_seq: u64,
    pub envelope: Vec<u8>,
}

/// The kinds whose product rows a settled reply changed, and whether the file turned out to be behind its own
/// device record, so pushing must stop (`PROTOCOL.md` §Devices).
pub struct Settled {
    pub changed: Vec<Kind>,
    pub is_behind: bool,
}

struct Cohort {
    commit_id: Vec<u8>,
    seqs: Vec<u64>,
    bytes: usize,
}

pub fn push_batch(db: &Database, max_items: usize, max_bytes: usize) -> Result<Batch, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_transaction(|tx| {
            // WHY: a row still in flight went out in a push whose outcome never arrived, perhaps because the app
            // stopped mid-push. Any member may have been consumed, so its cohort keeps its stamp.
            tx.execute(
                r#"
                UPDATE sync_cohorts SET state = 'fixed'
                WHERE state = 'uncertain' AND commit_id IN (SELECT commit_id FROM sync_outbox WHERE in_flight = 1)
                "#,
                [],
            )?;

            let mut picked = Vec::new();
            let (mut items, mut bytes) = (0, 0);
            for cohort in cohorts(tx)? {
                // INVARIANT: a push never splits a cohort. A cohort past either cap still goes alone, so every
                // batch makes progress.
                if !picked.is_empty() && (items + cohort.seqs.len() > max_items || bytes + cohort.bytes > max_bytes) {
                    break;
                }
                items += cohort.seqs.len();
                bytes += cohort.bytes;
                picked.push(cohort);
            }

            let mut seqs: Vec<u64> = picked.iter().flat_map(|cohort| cohort.seqs.iter().copied()).collect();
            seqs.sort_unstable();
            let mut batch = Vec::with_capacity(seqs.len());
            for sender_seq in seqs {
                tx.execute(
                    "UPDATE sync_outbox SET in_flight = 1 WHERE sender_seq = ?1",
                    params![sender_seq],
                )?;
                let envelope = tx.query_row(
                    "SELECT envelope FROM sync_outbox WHERE sender_seq = ?1",
                    params![sender_seq],
                    |row| row.get(0),
                )?;
                batch.push(BatchItem { sender_seq, envelope });
            }
            for cohort in &picked {
                // INVARIANT: a cohort that goes out may be consumed, so its stamp is no longer only local; a later
                // re-stamp issues above it (PROTOCOL.md, Cohorts).
                tx.execute(
                    r#"
                    UPDATE sync_state SET stable_hlc = MAX(stable_hlc, (SELECT hlc FROM sync_cohorts WHERE commit_id = ?1))
                    WHERE id = 1
                    "#,
                    params![cohort.commit_id],
                )?;
                tx.execute(
                    "UPDATE sync_cohorts SET state = 'uncertain' WHERE commit_id = ?1 AND state = 'local'",
                    params![cohort.commit_id],
                )?;
            }
            Ok(Batch { items: batch })
        })
    })
}

// WHY: rows already in flight come first, so a lost reply's bytes go out again before anything new.
fn cohorts(conn: &Connection) -> Result<Vec<Cohort>, AppError> {
    let rows: Vec<(u64, Vec<u8>, usize)> = conn
        .prepare("SELECT sender_seq, commit_id, length(envelope) FROM sync_outbox ORDER BY in_flight DESC, sender_seq")?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<_, _>>()?;

    let mut cohorts: Vec<Cohort> = Vec::new();
    for (sender_seq, commit_id, bytes) in rows {
        match cohorts.iter_mut().find(|cohort| cohort.commit_id == commit_id) {
            Some(cohort) => {
                cohort.seqs.push(sender_seq);
                cohort.bytes += bytes;
            }
            None => cohorts.push(Cohort {
                commit_id,
                seqs: vec![sender_seq],
                bytes,
            }),
        }
    }
    Ok(cohorts)
}

/// Applies a push reply: one outcome per item, in item order, ending early at `seq_reused`.
pub fn settle_push(
    db: &Database,
    batch: &Batch,
    outcomes: &[PushOutcome],
    starter: &Starter,
) -> Result<Settled, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_transaction(|tx| {
            if outcomes.len() > batch.items.len() {
                return Err(protocol_error("a push reply has more outcomes than the push had items"));
            }
            let own: Vec<u8> = tx.query_row("SELECT device_id FROM sync_state WHERE id = 1", [], |row| row.get(0))?;
            let own = DeviceId(<[u8; 16]>::try_from(own.as_slice()).map_err(protocol_error)?);
            let commits = batch_commits(tx, batch)?;

            let mut changed = Changed::default();
            let mut consumed = HashSet::new();
            let mut reached = 0;
            let mut highest_consumed = 0;
            let mut is_behind = false;
            for (item, outcome) in batch.items.iter().zip(outcomes) {
                if item.sender_seq != outcome.sender_seq {
                    return Err(protocol_error("push outcomes answer the items in order"));
                }
                if outcome.outcome == Outcome::SeqReused {
                    is_behind = true;
                    break;
                }
                let commit_id = settle_item(tx, item, outcome.outcome, own, starter, &mut changed)?;
                attachments::queue_uploads(tx, &outcome.missing_attachments)?;
                consumed.insert(commit_id);
                reached += 1;
                highest_consumed = item.sender_seq;
            }
            tx.execute(
                "UPDATE sync_state SET last_observed_server_seq = MAX(last_observed_server_seq, ?1) WHERE id = 1",
                params![highest_consumed],
            )?;

            // WHY: an item the reply did not reach was not consumed. A first send leaves flight, so a later write may
            // still replace it; a fixed cohort's row keeps its bytes, which an earlier lost push may have consumed.
            for item in batch.items.iter().skip(reached) {
                tx.execute(
                    r#"
                    UPDATE sync_outbox SET in_flight = 0
                    WHERE sender_seq = ?1
                      AND commit_id IN (SELECT commit_id FROM sync_cohorts WHERE state = 'uncertain')
                    "#,
                    params![item.sender_seq],
                )?;
            }
            for commit_id in &commits {
                let state = if consumed.contains(commit_id) { "fixed" } else { "local" };
                settle_cohort(tx, commit_id, state)?;
            }

            Ok(Settled {
                changed: changed.0,
                is_behind,
            })
        })
    })
}

/// Applies one consumed outcome in the transaction that clears or moves its row, and returns the row's cohort.
fn settle_item(
    conn: &Connection,
    item: &BatchItem,
    outcome: Outcome,
    own: DeviceId,
    starter: &Starter,
    changed: &mut Changed,
) -> Result<Vec<u8>, AppError> {
    let commit_id: Vec<u8> = conn
        .query_row(
            "SELECT commit_id FROM sync_outbox WHERE sender_seq = ?1 AND in_flight = 1",
            params![item.sender_seq],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| protocol_error(format!("seq {} is not in flight", item.sender_seq)))?;

    if let Outcome::Held { reason } = outcome {
        let reason = match reason {
            HeldReason::Schema => "schema",
            HeldReason::Dependency => "dependency",
        };
        conn.execute(
            r#"
            INSERT INTO sync_held (sender_seq, kind, id, group_name, commit_id, envelope, reason)
            SELECT sender_seq, kind, id, group_name, commit_id, envelope, ?2 FROM sync_outbox WHERE sender_seq = ?1
            "#,
            params![item.sender_seq, reason],
        )?;
    }
    conn.execute(
        "DELETE FROM sync_outbox WHERE sender_seq = ?1",
        params![item.sender_seq],
    )?;

    match outcome {
        // WHY: the server fenced the entity, so its tombstone is in the log; deleting here, fenced at the rejected
        // stamp, leaves the tombstone nothing to do when it is pulled.
        Outcome::Fenced => {
            let header = Envelope::decode(&item.envelope).map_err(protocol_error)?.header;
            let values = StampValues::new(
                header.stamp,
                own,
                i64::try_from(item.sender_seq).map_err(protocol_error)?,
            )?;
            delete_entity(conn, header.kind, &header.id, None, &values, starter, changed)?;
        }
        // WHY: a dead parent or template takes the entity with it, and its tombstone arrives by pull; publishing a
        // delete of the entity would add nothing.
        Outcome::DependencyFenced {
            action: DependencyAction::DropEntity,
        } => {
            let header = Envelope::decode(&item.envelope).map_err(protocol_error)?.header;
            drop_entity(conn, header.kind, &header.id, changed)?;
        }
        // WHY: the local row keeps its value. `existence` is a capture bug that heal re-push repairs, and a pointer to
        // a dead referent is swept when the referent's tombstone is pulled.
        Outcome::Applied
        | Outcome::Stale
        | Outcome::Existence
        | Outcome::DependencyFenced {
            action: DependencyAction::RepairPointer,
        }
        | Outcome::Held { .. }
        | Outcome::SeqReused => {}
    }
    Ok(commit_id)
}

pub fn pending_count(db: &Database) -> Result<usize, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let count = conn.query_row("SELECT COUNT(*) FROM sync_outbox", [], |row| row.get(0))?;
            Ok(count)
        })
    })
}

/// Writes the server consumed as `held`, waiting for their reason to clear.
pub fn held_count(db: &Database) -> Result<usize, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let count = conn.query_row("SELECT COUNT(*) FROM sync_held", [], |row| row.get(0))?;
            Ok(count)
        })
    })
}

/// How the file stands against its own device record (`PROTOCOL.md` §Devices).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Standing {
    Current,
    Behind,
    /// The record has consumed seqs after the last one this file saw consumed. Unless the server's receipts for
    /// `after < seq <= last_sender_seq` are all this file's own rows in flight, another copy pushed them.
    Unaccounted {
        after: u64,
    },
}

/// Compares the file with the `last_sender_seq` the caller read from its device record.
///
/// A row in flight is not a sign: it went out before, and its retry is a replay or comes back `seq_reused`.
pub fn standing(db: &Database, last_sender_seq: u64) -> Result<Standing, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let (is_behind, observed): (bool, u64) = conn.query_row(
                r#"
                SELECT ?1 >= s.next_sender_seq
                    OR EXISTS (SELECT 1 FROM sync_outbox WHERE in_flight = 0 AND sender_seq <= ?1),
                    s.last_observed_server_seq
                FROM sync_state s WHERE s.id = 1
                "#,
                params![last_sender_seq],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            Ok(if is_behind {
                Standing::Behind
            } else if last_sender_seq > observed {
                Standing::Unaccounted { after: observed }
            } else {
                Standing::Current
            })
        })
    })
}

/// Whether any of these receipts of the file's own sender is not one of its rows in flight, by seq and digest.
///
/// WHY: a seq the file numbered and then dropped, as when a second save replaced an unsent row, has no receipt;
/// a receipt that matches no row in flight was pushed by another copy of the file.
pub fn has_foreign_receipt(db: &Database, receipts: &[(u64, [u8; 32])]) -> Result<bool, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            for (sender_seq, digest) in receipts {
                let is_own: bool = conn.query_row(
                    r#"
                    SELECT EXISTS (SELECT 1 FROM sync_outbox WHERE sender_seq = ?1 AND digest = ?2 AND in_flight = 1)
                    "#,
                    params![sender_seq, digest.as_slice()],
                    |row| row.get(0),
                )?;
                if !is_own {
                    return Ok(true);
                }
            }
            Ok(false)
        })
    })
}

/// Handles an error reply to a push, which consumed nothing (`PROTOCOL.md` §Push outcomes).
pub fn push_refused(db: &Database, batch: &Batch) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_transaction(|tx| {
            for commit_id in batch_commits(tx, batch)? {
                // INVARIANT: only a cohort sent for the first time returns to `local`. A fixed cohort's rows stay in
                // flight, since an earlier lost push may have consumed them.
                tx.execute(
                    r#"
                    UPDATE sync_outbox SET in_flight = 0
                    WHERE commit_id = ?1 AND commit_id IN (SELECT commit_id FROM sync_cohorts WHERE state = 'uncertain')
                    "#,
                    params![commit_id],
                )?;
                settle_cohort(tx, &commit_id, "local")?;
            }
            Ok(())
        })
    })
}

/// Handles a push with no complete reply: any member may have been consumed, so every cohort it carried keeps its
/// stamp, and its rows stay in flight for the same bytes to go out again.
pub fn push_lost(db: &Database, batch: &Batch) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_transaction(|tx| {
            for commit_id in batch_commits(tx, batch)? {
                settle_cohort(tx, &commit_id, "fixed")?;
            }
            Ok(())
        })
    })
}

fn batch_commits(conn: &Connection, batch: &Batch) -> Result<Vec<Vec<u8>>, AppError> {
    let mut commits: Vec<Vec<u8>> = Vec::new();
    for item in &batch.items {
        let commit_id: Option<Vec<u8>> = conn
            .query_row(
                "SELECT commit_id FROM sync_outbox WHERE sender_seq = ?1",
                params![item.sender_seq],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(commit_id) = commit_id.filter(|commit_id| !commits.contains(commit_id)) {
            commits.push(commit_id);
        }
    }
    Ok(commits)
}

/// Moves an `uncertain` cohort to `state`, or deletes the cohort once no outbox row is left in it.
fn settle_cohort(conn: &Connection, commit_id: &[u8], state: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE sync_cohorts SET state = ?2 WHERE commit_id = ?1 AND state = 'uncertain'",
        params![commit_id, state],
    )?;
    super::delete_empty_cohort(conn, commit_id)
}
