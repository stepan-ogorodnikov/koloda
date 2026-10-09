//! An authoritative server restore: the backup is the truth, so the file discards its product rows and sync tables
//! and bootstraps again as a blank joiner under its existing token (`crates/koloda-sync-proto/PROTOCOL.md` §Server
//! restore).
//!
//! The host accepts first: `hold_authoritative` records the restore, and nothing is deleted until
//! `reset_for_authoritative` runs.

use rusqlite::params;
use uuid::Uuid;

use super::join::{delete_product_rows, SYNC_TABLES};
use super::protocol_error;
use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};

/// Records an authoritative restore that moved the space to `epoch`; `last_sender_seq` is the server's for this
/// device. A later restore replaces the record.
pub fn hold_authoritative(db: &Database, epoch: Uuid, last_sender_seq: u64) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_conn(|conn| {
            conn.execute(
                "UPDATE sync_state SET authoritative_epoch = ?1, authoritative_last_seq = ?2 WHERE id = 1",
                params![
                    epoch.as_bytes().as_slice(),
                    i64::try_from(last_sender_seq).map_err(protocol_error)?
                ],
            )?;
            Ok(())
        })
    })
}

/// Discards the file's product rows and sync tables for the recorded restore, and leaves it to bootstrap as a blank
/// joiner. Settings, conversations, and attachments stay; `learning` stays at stamp zero for the space to overlay.
pub fn reset_for_authoritative(db: &Database) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_DELETE, || {
        db.with_transaction(|tx| {
            let is_held: bool = tx.query_row(
                "SELECT authoritative_epoch IS NOT NULL FROM sync_state WHERE id = 1",
                [],
                |row| row.get(0),
            )?;
            if !is_held {
                return Err(protocol_error("no authoritative restore is waiting"));
            }
            delete_product_rows(tx)?;
            // WHY: the device id stays, and so does a re-attach's claim this file has not recorded yet; a later
            // join with its code still finishes it.
            for table in SYNC_TABLES
                .iter()
                .filter(|table| !matches!(**table, "sync_state" | "sync_enrolling"))
            {
                tx.execute(&format!("DELETE FROM {table}"), [])?;
            }
            // INVARIANT: the device id stays, so its next seq must be above every seq it ever sent and every seq the
            // server consumed for it; the observed high-water rises with it, or the file would read the server's
            // record as another copy's pushes and fork (PROTOCOL.md, Behind its own record).
            tx.execute(
                r#"
                UPDATE sync_state
                SET epoch = authoritative_epoch,
                    next_sender_seq = MAX(next_sender_seq, authoritative_last_seq + 1),
                    last_observed_server_seq = MAX(last_observed_server_seq, authoritative_last_seq),
                    cursor_hot = 0, cursor_cold = 0, is_bootstrapping = 1,
                    is_rebasing = 0, heal_step = NULL, heal_after_id = NULL,
                    backfill_step = NULL, backfill_after_ts = NULL, backfill_after_id = NULL,
                    fork_nonce = NULL, is_clock_paused = 0, is_checking_attachments = 1,
                    authoritative_epoch = NULL, authoritative_last_seq = NULL
                WHERE id = 1
                "#,
                [],
            )?;
            Ok(())
        })
    })
}
