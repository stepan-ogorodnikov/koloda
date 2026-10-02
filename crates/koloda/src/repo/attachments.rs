//! Attachment SQL — mirrors `@koloda/db-sqlite` `lib/attachments.ts`.
//!
//! Validation lives in `domain/attachments`. Bytes go through `repo::attachment_bytes` only.

use rusqlite::{params, Connection, OptionalExtension, Row};
use sha2::{Digest, Sha256};

use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::app::utility::get_current_timestamp;
use crate::domain::attachments::{AddAttachmentData, Attachment, SweepAttachmentsData};
use crate::repo::attachment_bytes;

fn get_attachment_row(row: &Row) -> Result<Attachment, rusqlite::Error> {
    Ok(Attachment {
        id: row.get(0)?,
        mime: row.get(1)?,
        size: row.get(2)?,
        width: row.get(3)?,
        height: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn select_attachment(conn: &Connection, id: &str) -> Result<Option<Attachment>, AppError> {
    conn.query_row(
        "SELECT id, mime, size, width, height, created_at FROM attachments WHERE id = ?1",
        params![id],
        get_attachment_row,
    )
    .optional()
    .map_err(AppError::from)
}

pub fn add_attachment(db: &Database, data: AddAttachmentData) -> Result<Attachment, AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        let mime = data.validate()?;
        // INVARIANT: the id is the lowercase hex SHA-256 of the bytes, so equal bytes share one row.
        let id = format!("{:x}", Sha256::digest(&data.bytes));
        let now = get_current_timestamp()?;

        db.with_transaction(|tx| {
            let inserted = tx.execute(
                r#"
                INSERT INTO attachments (id, mime, size, width, height, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ON CONFLICT (id) DO NOTHING
                "#,
                params![
                    id,
                    mime,
                    data.bytes.len() as i64,
                    data.width.map(|width| width.get()),
                    data.height.map(|height| height.get()),
                    now
                ],
            )?;
            // WHY: a re-add of the same bytes keeps the first row and its bytes unchanged.
            if inserted > 0 {
                attachment_bytes::put(tx, &id, &data.bytes)?;
            }
            select_attachment(tx, &id)?
                .ok_or_else(|| AppError::new(error_codes::UNKNOWN, Some("no row returned".to_string())))
        })
    })
}

pub fn get_attachment(db: &Database, id: &str) -> Result<Option<Attachment>, AppError> {
    throw_known_error(error_codes::DB_GET, || db.with_conn(|conn| select_attachment(conn, id)))
}

pub fn sweep_attachments(db: &Database, data: SweepAttachmentsData) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_DELETE, || {
        db.with_conn(|conn| {
            // WHY: a hex id cannot be hidden by JSON escaping, so a substring match on the stored
            // content finds every ref without parsing it. Bytes go through the foreign-key cascade.
            conn.execute(
                r#"
                DELETE FROM attachments
                WHERE created_at < ?1
                  AND NOT EXISTS (SELECT 1 FROM cards WHERE instr(cards.content, 'attachment:' || attachments.id) > 0)
                "#,
                params![data.created_before],
            )?;
            Ok(())
        })
    })
}

pub fn get_attachment_bytes(db: &Database, id: &str) -> Result<Option<Vec<u8>>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| attachment_bytes::get(conn, id))
    })
}
