//! The only reader and writer of `attachment_bytes` — mirrors `@koloda/db-sqlite` `lib/attachment-bytes.ts`.
//!
//! A file store replaces this module; attachment metadata and card refs never move.
//! See `docs/decisions/MEDIA-STORAGE.md`.

use rusqlite::{params, Connection, OptionalExtension};

use crate::app::error::AppError;

pub(crate) fn put(conn: &Connection, id: &str, bytes: &[u8]) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO attachment_bytes (id, bytes) VALUES (?1, ?2)",
        params![id, bytes],
    )?;
    Ok(())
}

pub(crate) fn get(conn: &Connection, id: &str) -> Result<Option<Vec<u8>>, AppError> {
    conn.query_row("SELECT bytes FROM attachment_bytes WHERE id = ?1", params![id], |row| {
        row.get(0)
    })
    .optional()
    .map_err(AppError::from)
}
