//! Push batches and their outcomes (`crates/koloda-sync-proto/PROTOCOL.md` §Cohorts, §Outbox, §Push outcomes).
//!
//! A batch puts its rows in flight and its `local` cohorts in `uncertain`. Its reply, its loss, or its refusal then
//! settles every row it carried in one transaction.

use std::collections::HashSet;

use koloda_sync_proto::envelope::{digest, Envelope, Header};
use koloda_sync_proto::hlc::DeviceId;
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{DependencyAction, HeldReason, Outcome, PushOutcome};
use rusqlite::{params, Connection, OptionalExtension, ToSql};

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
                let state = if consumed.contains(commit_id) {
                    mark_consumed(tx, commit_id)?;
                    "fixed"
                } else {
                    "local"
                };
                settle_cohort(tx, commit_id, state)?;
            }

            Ok(Settled {
                changed: changed.0,
                is_behind,
            })
        })
    })
}

// INVARIANT: a consumed cohort's stamp is no longer only local, and its cohort row goes once its last member settles.
// The stable high-water keeps the stamp, so a later re-stamp issues above it (PROTOCOL.md, Cohorts).
pub(super) fn mark_consumed(conn: &Connection, commit_id: &[u8]) -> Result<(), AppError> {
    conn.execute(
        "UPDATE sync_cohorts SET has_consumed = 1 WHERE commit_id = ?1",
        params![commit_id],
    )?;
    conn.execute(
        r#"
        UPDATE sync_state SET stable_hlc = MAX(stable_hlc, (SELECT hlc FROM sync_cohorts WHERE commit_id = ?1))
        WHERE id = 1 AND EXISTS (SELECT 1 FROM sync_cohorts WHERE commit_id = ?1)
        "#,
        params![commit_id],
    )?;
    Ok(())
}

/// Applies one consumed outcome in the transaction that clears or moves its row, and returns the row's cohort.
pub(super) fn settle_item(
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
            HeldReason::Quota => "quota",
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
            delete_entity(conn, &header, None, &values, starter, changed)?;
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

/// The lowest seq still in the outbox, where receipts for a switch to a new device id start.
pub fn lowest_pending_seq(db: &Database) -> Result<Option<u64>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| Ok(conn.query_row("SELECT MIN(sender_seq) FROM sync_outbox", [], |row| row.get(0))?))
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

/// Moves the writes held for `quota`, and every write held for `dependency`, back to the outbox once the space has room;
/// returns how many went back (`PROTOCOL.md` §Push outcomes). Nothing moves while no write is held for `quota`.
///
/// INVARIANT: a released write keeps its bytes, stamp, and `commit_id`, and takes a new seq in a `fixed` cohort; the
/// register, origin, or tombstone it lives in takes that seq. Writes still pending move behind the released ones, so a
/// write that names a held create goes out after it.
pub fn release_held(db: &Database) -> Result<usize, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_transaction(|tx| {
            let has_quota: bool = tx.query_row(
                "SELECT EXISTS (SELECT 1 FROM sync_held WHERE reason = 'quota')",
                [],
                |row| row.get(0),
            )?;
            if !has_quota {
                return Ok(0);
            }
            let (device, mut next): (Vec<u8>, i64) = tx.query_row(
                "SELECT device_id, next_sender_seq FROM sync_state WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            let held: Vec<(i64, Vec<u8>, Vec<u8>)> = tx
                .prepare(
                    r#"
                    SELECT sender_seq, commit_id, envelope FROM sync_held
                    WHERE reason IN ('quota', 'dependency') ORDER BY sender_seq
                    "#,
                )?
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
                .collect::<Result<_, _>>()?;
            let pending: Vec<i64> = tx
                .prepare("SELECT sender_seq FROM sync_outbox WHERE in_flight = 0 ORDER BY sender_seq")?
                .query_map([], |row| row.get(0))?
                .collect::<Result<_, _>>()?;

            let mut released = 0;
            for (held_seq, commit_id, envelope) in held {
                tx.execute("DELETE FROM sync_held WHERE sender_seq = ?1", params![held_seq])?;
                let header = Envelope::decode(&envelope).map_err(protocol_error)?.header;
                let Some(home) = Home::of(tx, &header)? else {
                    continue;
                };
                let sender_seq = next;
                next += 1;
                tx.execute(
                    r#"
                    INSERT INTO sync_outbox (sender_seq, kind, id, group_name, commit_id, envelope, digest, in_flight)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)
                    "#,
                    params![
                        sender_seq,
                        header.kind.as_wire(),
                        header.id,
                        header.group.map(|group| group.as_wire()),
                        commit_id,
                        envelope,
                        digest(&envelope).0.as_slice()
                    ],
                )?;
                home.renumber(tx, &header, &device, sender_seq)?;
                tx.execute(
                    r#"
                    INSERT INTO sync_cohorts (commit_id, state, hlc, stamp_device, has_consumed)
                    VALUES (?1, 'fixed', ?2, ?3, 1)
                    ON CONFLICT (commit_id) DO UPDATE SET state = 'fixed', has_consumed = 1
                    "#,
                    params![
                        commit_id,
                        i64::try_from(header.stamp.hlc.raw()).map_err(protocol_error)?,
                        header.stamp.device.0.as_slice()
                    ],
                )?;
                released += 1;
            }
            if released > 0 {
                for old_seq in pending {
                    let new_seq = next;
                    next += 1;
                    tx.execute(
                        "UPDATE sync_outbox SET sender_seq = ?2 WHERE sender_seq = ?1",
                        params![old_seq, new_seq],
                    )?;
                    for table in ["sync_stamps", "sync_origins", "sync_tombstones"] {
                        tx.execute(
                            &format!("UPDATE {table} SET sender_seq = ?3 WHERE sender = ?1 AND sender_seq = ?2"),
                            params![device, old_seq, new_seq],
                        )?;
                    }
                }
            }
            tx.execute("UPDATE sync_state SET next_sender_seq = ?1 WHERE id = 1", params![next])?;
            Ok(released)
        })
    })
}

/// The row a held write lives in: a tombstone, the origin of a create or immutable row, or a group's register.
enum Home {
    Tombstone,
    Origin,
    Register,
}

impl Home {
    /// Where the write lives while that row still holds its stamp. A row with another stamp was overwritten since,
    /// so the held write would only come back `stale`; a missing one was deleted.
    fn of(conn: &Connection, header: &Header) -> Result<Option<Home>, AppError> {
        let (kind, id) = (header.kind.as_wire(), header.id.as_str());
        let stamp = |sql: &str, params: &[&dyn ToSql]| {
            conn.query_row(sql, params, |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, Vec<u8>>(1)?))
            })
            .optional()
        };
        let (home, stored) = match header.group {
            None => (
                Home::Tombstone,
                stamp(
                    "SELECT hlc, stamp_device FROM sync_tombstones WHERE kind = ?1 AND id = ?2",
                    &[&kind, &id],
                )?,
            ),
            Some(group @ (Group::Create | Group::Row)) => (
                Home::Origin,
                stamp(
                    "SELECT hlc, stamp_device FROM sync_origins WHERE kind = ?1 AND id = ?2 AND group_name = ?3",
                    &[&kind, &id, &group.as_wire()],
                )?,
            ),
            Some(group) => (
                Home::Register,
                stamp(
                    "SELECT hlc, stamp_device FROM sync_stamps WHERE kind = ?1 AND id = ?2 AND group_name = ?3",
                    &[&kind, &id, &group.as_wire()],
                )?,
            ),
        };
        let is_current = stored.is_some_and(|(hlc, device)| {
            u64::try_from(hlc).is_ok_and(|hlc| hlc == header.stamp.hlc.raw())
                && device.as_slice() == header.stamp.device.0.as_slice()
        });
        Ok(is_current.then_some(home))
    }

    fn renumber(&self, conn: &Connection, header: &Header, device: &[u8], sender_seq: i64) -> Result<(), AppError> {
        let (kind, id) = (header.kind.as_wire(), header.id.as_str());
        let group = header.group.map(|group| group.as_wire());
        match self {
            Home::Tombstone => conn.execute(
                "UPDATE sync_tombstones SET sender = ?1, sender_seq = ?2 WHERE kind = ?3 AND id = ?4",
                params![device, sender_seq, kind, id],
            )?,
            Home::Origin => conn.execute(
                "UPDATE sync_origins SET sender = ?1, sender_seq = ?2 WHERE kind = ?3 AND id = ?4 AND group_name = ?5",
                params![device, sender_seq, kind, id, group],
            )?,
            Home::Register => conn.execute(
                "UPDATE sync_stamps SET sender = ?1, sender_seq = ?2 WHERE kind = ?3 AND id = ?4 AND group_name = ?5",
                params![device, sender_seq, kind, id, group],
            )?,
        };
        Ok(())
    }
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
