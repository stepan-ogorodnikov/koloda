//! Attachment transfers: uploads the server asked for in push outcomes, and fetches of images that remote cards link
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Attachments).
//!
//! The queue pins nothing: the startup sweep still removes an attachment no card links, and its upload then drops.

use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::domain::attachments::{AddAttachmentData, Attachment};
use crate::repo::attachment_bytes;
use crate::repo::attachments::{insert_attachment, select_attachment};

use super::protocol_error;

const FIRST_RETRY_MS: i64 = 60 * 1000;
const LAST_RETRY_MS: i64 = 6 * 60 * 60 * 1000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Direction {
    Upload,
    Fetch,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Transfer {
    pub id: String,
    pub direction: Direction,
}

impl Direction {
    fn as_sql(self) -> &'static str {
        match self {
            Direction::Upload => "upload",
            Direction::Fetch => "fetch",
        }
    }
}

/// Queues a fetch of each linked id this device holds no attachment for.
pub(super) fn queue_fetches(conn: &Connection, ids: &[String]) -> Result<(), AppError> {
    for id in ids {
        conn.execute(
            r#"
            INSERT OR IGNORE INTO sync_attachment_queue (id, direction, attempts, next_attempt_at)
            SELECT ?1, 'fetch', 0, 0 WHERE NOT EXISTS (SELECT 1 FROM attachments WHERE id = ?1)
            "#,
            params![id],
        )?;
    }
    Ok(())
}

/// Queues an upload of each id the server lacks that this device still holds; one it lacks is someone else's to send.
pub(super) fn queue_uploads(conn: &Connection, ids: &[String]) -> Result<(), AppError> {
    for id in ids {
        conn.execute(
            r#"
            INSERT OR IGNORE INTO sync_attachment_queue (id, direction, attempts, next_attempt_at)
            SELECT ?1, 'upload', 0, 0 WHERE EXISTS (SELECT 1 FROM attachments WHERE id = ?1)
            "#,
            params![id],
        )?;
    }
    Ok(())
}

/// Up to `limit` transfers due at `now`, oldest first. A fetch whose attachment arrived meanwhile, or that no local
/// card links any more, is dropped instead of listed.
pub fn due_transfers(db: &Database, now: i64, limit: usize) -> Result<Vec<Transfer>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_transaction(|tx| {
            let mut statement = tx.prepare(
                r#"
                SELECT id, direction FROM sync_attachment_queue
                WHERE next_attempt_at <= ?1 ORDER BY next_attempt_at, direction, id
                "#,
            )?;
            let queued = statement
                .query_map(params![now], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            let mut due = Vec::new();
            for (id, direction) in queued {
                if due.len() == limit {
                    break;
                }
                let direction = match direction.as_str() {
                    "upload" => Direction::Upload,
                    "fetch" => Direction::Fetch,
                    other => return Err(protocol_error(format!("unknown transfer direction {other}"))),
                };
                if direction == Direction::Fetch && !is_wanted(tx, &id)? {
                    finish(tx, &id, direction)?;
                    continue;
                }
                due.push(Transfer { id, direction });
            }
            Ok(due)
        })
    })
}

/// What to send for a queued upload, or `None` once the attachment is gone, which drops the upload.
pub fn upload_source(db: &Database, id: &str) -> Result<Option<(Attachment, Vec<u8>)>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_transaction(|tx| {
            let attachment = select_attachment(tx, id)?;
            let bytes = attachment_bytes::get(tx, id)?;
            match (attachment, bytes) {
                (Some(attachment), Some(bytes)) => Ok(Some((attachment, bytes))),
                _ => {
                    finish(tx, id, Direction::Upload)?;
                    Ok(None)
                }
            }
        })
    })
}

/// Drops a queued transfer: it went through, or the server refused it for good.
pub fn finish_transfer(db: &Database, transfer: &Transfer) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_DELETE, || {
        db.with_conn(|conn| finish(conn, &transfer.id, transfer.direction))
    })
}

/// Stores fetched bytes and drops the fetch, in one transaction. Bytes that do not hash to `id`, or that an add would
/// refuse, are not stored; the fetch drops all the same and the call returns `false`.
pub fn store_fetched(db: &Database, id: &str, data: &AddAttachmentData) -> Result<bool, AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        let mime = match data.validate() {
            Ok(mime) if format!("{:x}", Sha256::digest(&data.bytes)) == id => Some(mime),
            _ => None,
        };
        db.with_transaction(|tx| {
            if let Some(mime) = mime {
                insert_attachment(tx, id, mime, data)?;
            }
            finish(tx, id, Direction::Fetch)?;
            Ok(mime.is_some())
        })
    })
}

/// Schedules the next attempt of a fetch the server could not serve yet: 1 minute, doubling up to 6 hours.
pub fn defer_fetch(db: &Database, id: &str, now: i64) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_transaction(|tx| {
            let attempts: u32 = tx.query_row(
                "SELECT attempts FROM sync_attachment_queue WHERE id = ?1 AND direction = 'fetch'",
                params![id],
                |row| row.get(0),
            )?;
            let delay = 2_i64
                .checked_pow(attempts)
                .and_then(|factor| FIRST_RETRY_MS.checked_mul(factor))
                .map_or(LAST_RETRY_MS, |delay| delay.min(LAST_RETRY_MS));
            tx.execute(
                r#"
                UPDATE sync_attachment_queue SET attempts = attempts + 1, next_attempt_at = ?2
                WHERE id = ?1 AND direction = 'fetch'
                "#,
                params![id, now + delay],
            )?;
            Ok(())
        })
    })
}

// WHY: a hex id cannot be hidden by JSON escaping, so a substring match finds every card that links it, as the
// startup sweep does.
fn is_wanted(conn: &Connection, id: &str) -> Result<bool, AppError> {
    Ok(conn.query_row(
        r#"
        SELECT NOT EXISTS (SELECT 1 FROM attachments WHERE id = ?1)
           AND EXISTS (SELECT 1 FROM cards WHERE instr(cards.content, 'attachment:' || ?1) > 0)
        "#,
        params![id],
        |row| row.get(0),
    )?)
}

fn finish(conn: &Connection, id: &str, direction: Direction) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM sync_attachment_queue WHERE id = ?1 AND direction = ?2",
        params![id, direction.as_sql()],
    )?;
    Ok(())
}
