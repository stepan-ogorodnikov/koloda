//! Switching a file to a new device id: after a fork, or when a detached file re-attaches
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Behind its own record, §Re-attach).
//!
//! Receipts of the old sender tell which pending writes the server already took; everything else is renumbered at
//! the new sender's sequence, and cohorts no receipt touched take new stamps.

use std::collections::HashSet;

use koloda_sync_proto::hlc::DeviceId;
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::Receipt;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use super::outbox::{mark_consumed, settle_item, BatchItem};
use super::rebase::open_barrier;
use super::repair::Starter;
use super::restamp::restamp;
use super::{protocol_error, Changed};
use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};

/// Moves the file to `new_device` in one transaction, and returns the kinds whose product rows a settled receipt
/// changed. `receipts` are the old sender's, for its pending seqs at or below its `last_sender_seq`. With
/// `is_rebase`, the re-bootstrap barrier opens in the same transaction, so the new id never runs without it. A
/// re-attach passes the `server_url` its code was redeemed through, which may differ from the stored one, and its
/// pending claim is cleared with the switch that records it.
///
/// INVARIANT: the caller stores the new token first, so a crash leaves the file as it was or fully switched.
pub fn switch_device(
    db: &Database,
    new_device: Uuid,
    receipts: &[Receipt],
    starter: &Starter,
    now_ms: u64,
    is_rebase: bool,
    server_url: Option<&str>,
) -> Result<Vec<Kind>, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_transaction(|tx| {
            let old: Vec<u8> = tx.query_row("SELECT device_id FROM sync_state WHERE id = 1", [], |row| row.get(0))?;
            let old = DeviceId(<[u8; 16]>::try_from(old.as_slice()).map_err(protocol_error)?);
            let mut changed = Changed::default();

            let accepted = settle_accepted(tx, receipts, old, starter, &mut changed)?;
            classify(tx, &accepted)?;
            let next_sender_seq = renumber(tx, old, new_device)?;
            tx.execute(
                r#"
                UPDATE sync_state
                SET device_id = ?1, next_sender_seq = ?2, last_observed_server_seq = 0, detached_at = NULL,
                    fork_nonce = NULL, server_url = COALESCE(?3, server_url)
                WHERE id = 1
                "#,
                params![new_device.as_bytes().as_slice(), next_sender_seq, server_url],
            )?;
            // INVARIANT: only a re-attach passes a server URL. A fork leaves alone a claim pending for another space.
            if server_url.is_some() {
                tx.execute("DELETE FROM sync_enrolling", [])?;
            }
            // INVARIANT: re-stamp runs after the id swap, so the cohorts no receipt touched carry the new device.
            // Two copies that adopted the same remote stamp would otherwise mint identical stamps next.
            restamp(tx, now_ms)?;
            if is_rebase {
                open_barrier(tx)?;
            }
            Ok(changed.0)
        })
    })
}

/// The nonce of a fork that has not switched yet. The pending token for it lives in the secret store, written
/// before this nonce.
pub fn stored_fork_nonce(db: &Database) -> Result<Option<[u8; 16]>, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_conn(|conn| {
            let nonce: Option<Vec<u8>> =
                conn.query_row("SELECT fork_nonce FROM sync_state WHERE id = 1", [], |row| row.get(0))?;
            nonce
                .map(|nonce| <[u8; 16]>::try_from(nonce.as_slice()).map_err(protocol_error))
                .transpose()
        })
    })
}

/// Stores `nonce` as the fork in progress, replacing one whose pending token is gone.
pub fn store_fork_nonce(db: &Database, nonce: [u8; 16]) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_conn(|conn| {
            conn.execute(
                "UPDATE sync_state SET fork_nonce = ?1 WHERE id = 1",
                params![nonce.as_slice()],
            )?;
            Ok(())
        })
    })
}

/// Settles every pending row whose receipt carries its digest, as the push reply that consumed it would have, and
/// returns the cohorts with a consumed member. A different digest, or no receipt, means the row was never accepted.
fn settle_accepted(
    conn: &Connection,
    receipts: &[Receipt],
    old: DeviceId,
    starter: &Starter,
    changed: &mut Changed,
) -> Result<HashSet<Vec<u8>>, AppError> {
    let mut accepted = HashSet::new();
    for receipt in receipts {
        let envelope: Option<Vec<u8>> = conn
            .query_row(
                "SELECT envelope FROM sync_outbox WHERE sender_seq = ?1 AND digest = ?2",
                params![receipt.sender_seq, receipt.digest.as_slice()],
                |row| row.get(0),
            )
            .optional()?;
        let Some(envelope) = envelope else {
            continue;
        };
        // WHY: the receipt proves the row went out, from this file or from a copy that held the same bytes.
        conn.execute(
            "UPDATE sync_outbox SET in_flight = 1 WHERE sender_seq = ?1",
            params![receipt.sender_seq],
        )?;
        let item = BatchItem {
            sender_seq: receipt.sender_seq,
            envelope,
        };
        accepted.insert(settle_item(conn, &item, receipt.outcome, old, starter, changed)?);
    }
    Ok(accepted)
}

// INVARIANT: classification is by cohort, never by envelope. A cohort with any consumed member keeps its stamp for
// good; splitting it would let a reset's blank scheduling take a newer stamp than its reset.
fn classify(conn: &Connection, accepted: &HashSet<Vec<u8>>) -> Result<(), AppError> {
    for commit_id in accepted {
        mark_consumed(conn, commit_id)?;
    }
    conn.execute(
        "DELETE FROM sync_cohorts WHERE commit_id NOT IN (SELECT commit_id FROM sync_outbox)",
        [],
    )?;
    conn.execute(
        "UPDATE sync_cohorts SET state = CASE WHEN has_consumed = 1 THEN 'fixed' ELSE 'local' END",
        [],
    )?;
    Ok(())
}

/// Renumbers every pending row from 1 in its old order under `new_device`, out of flight, with the register, origin,
/// or tombstone it wrote; returns the next free seq. `sync_held` rows were consumed under the old sender and stay.
fn renumber(conn: &Connection, old: DeviceId, new_device: Uuid) -> Result<i64, AppError> {
    let seqs: Vec<i64> = conn
        .prepare("SELECT sender_seq FROM sync_outbox ORDER BY sender_seq")?
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;

    let mut next = 1;
    for old_seq in seqs {
        // WHY: rows move down in ascending order, so the seq a row takes is its own or one a moved row left free.
        conn.execute(
            "UPDATE sync_outbox SET sender_seq = ?2, in_flight = 0 WHERE sender_seq = ?1",
            params![old_seq, next],
        )?;
        for table in ["sync_stamps", "sync_origins", "sync_tombstones"] {
            conn.execute(
                &format!("UPDATE {table} SET sender = ?3, sender_seq = ?4 WHERE sender = ?1 AND sender_seq = ?2"),
                params![old.0.as_slice(), old_seq, new_device.as_bytes().as_slice(), next],
            )?;
        }
        next += 1;
    }
    Ok(next)
}
