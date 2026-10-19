//! Attachment SQL — mirrors `@koloda/db-sqlite` `lib/attachments.ts`.
//!
//! Validation lives in `domain/attachments`. Bytes go through `repo::attachment_bytes` only.

use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension, Row};
use sha2::{Digest, Sha256};

use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::app::utility::get_current_timestamp;
use crate::domain::attachments::{AddAttachmentData, Attachment, SweepAttachmentsData};
use crate::repo::attachment_bytes;

const ATTACHMENT_REF_PREFIX: &str = "attachment:";
const ATTACHMENT_ID_LEN: usize = 64;

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

pub(crate) fn select_attachment(conn: &Connection, id: &str) -> Result<Option<Attachment>, AppError> {
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

        db.with_transaction(|tx| {
            insert_attachment(tx, &id, mime, &data)?;
            select_attachment(tx, &id)?
                .ok_or_else(|| AppError::new(error_codes::UNKNOWN, Some("no row returned".to_string())))
        })
    })
}

/// Inserts validated bytes under `id`, which the caller has checked is their SHA-256. Sync stores fetched bytes
/// through it too, so every attachment row is written one way.
pub(crate) fn insert_attachment(
    conn: &Connection,
    id: &str,
    mime: &str,
    data: &AddAttachmentData,
) -> Result<(), AppError> {
    let inserted = conn.execute(
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
            get_current_timestamp()?
        ],
    )?;
    // WHY: a re-add of the same bytes keeps the first row and its bytes unchanged.
    if inserted > 0 {
        attachment_bytes::put(conn, id, &data.bytes)?;
    }
    Ok(())
}

pub fn get_attachment(db: &Database, id: &str) -> Result<Option<Attachment>, AppError> {
    throw_known_error(error_codes::DB_GET, || db.with_conn(|conn| select_attachment(conn, id)))
}

pub fn sweep_attachments(db: &Database, data: SweepAttachmentsData) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_DELETE, || {
        db.with_transaction(|tx| {
            let mut stmt = tx.prepare("SELECT id FROM attachments WHERE created_at < ?1")?;
            let mut unreferenced = stmt
                .query_map(params![data.created_before], |row| row.get::<_, String>(0))?
                .collect::<Result<HashSet<_>, _>>()?;
            if unreferenced.is_empty() {
                return Ok(());
            }

            // WHY: one pass over the cards, not a scan per attachment, which grew as cards × attachments
            // on the launch path. A hex id cannot be hidden by JSON escaping, so the text after each
            // `attachment:` in the stored content is every ref, without parsing it.
            let mut stmt = tx.prepare("SELECT content FROM cards")?;
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                let content: String = row.get(0)?;
                for (start, _) in content.match_indices(ATTACHMENT_REF_PREFIX) {
                    let id_start = start + ATTACHMENT_REF_PREFIX.len();
                    if let Some(id) = content.get(id_start..id_start + ATTACHMENT_ID_LEN) {
                        unreferenced.remove(id);
                    }
                }
                if unreferenced.is_empty() {
                    return Ok(());
                }
            }

            // WHY: bytes go through the foreign-key cascade.
            let mut stmt = tx.prepare("DELETE FROM attachments WHERE id = ?1")?;
            for id in &unreferenced {
                stmt.execute(params![id])?;
            }
            Ok(())
        })
    })
}

pub fn get_attachment_bytes(db: &Database, id: &str) -> Result<Option<Vec<u8>>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| attachment_bytes::get(conn, id))
    })
}
