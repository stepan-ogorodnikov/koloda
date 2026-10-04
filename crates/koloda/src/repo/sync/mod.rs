//! Sync bookkeeping SQL: device enrollment here, capture of product writes in `capture`
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Field groups and merge, §Clocks and order, §Client state).
//!
//! Only the desktop store writes the `sync_*` tables; the web host does not sync.

pub mod capture;

use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};

pub fn enroll_device(db: &Database, device_id: Uuid) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        db.with_conn(|conn| {
            conn.execute(
                r#"
                INSERT INTO sync_state (id, device_id, last_hlc, next_sender_seq)
                VALUES (1, ?1, 0, 1)
                "#,
                params![device_id.as_bytes().as_slice()],
            )?;

            Ok(())
        })
    })
}

pub fn enrolled_device(db: &Database) -> Result<Option<Uuid>, AppError> {
    throw_known_error(error_codes::DB_GET, || db.with_conn(select_enrolled_device))
}

fn select_enrolled_device(conn: &Connection) -> Result<Option<Uuid>, AppError> {
    let device: Option<Vec<u8>> = conn
        .query_row("SELECT device_id FROM sync_state WHERE id = 1", [], |row| row.get(0))
        .optional()?;

    device
        .map(|bytes| Uuid::from_slice(&bytes).map_err(protocol_error))
        .transpose()
}

fn protocol_error(error: impl std::fmt::Display) -> AppError {
    AppError::new(error_codes::UNKNOWN, Some(error.to_string()))
}
