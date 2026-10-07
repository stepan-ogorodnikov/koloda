//! Attachment bytes by content address (`PROTOCOL.md` §Attachments): files under the generation, metadata in the
//! space database.
//!
//! INVARIANT: the server checks the SHA-256 of the bytes against the id and never sniffs them, so ciphertext can
//! replace them later.

use std::fs::{self, File};
use std::io::{self, Write};
use std::num::NonZeroU32;
use std::path::Path;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::rejection::QueryRejection;
use axum::extract::{Path as UrlPath, Query, State};
use axum::http::HeaderMap;
use axum::response::Response;
use koloda_sync_proto::envelope::Header;
use koloda_sync_proto::registry::{Group, Kind};
use koloda_sync_proto::transport::{
    AttachmentBody, Empty, MissingAttachments, ATTACHMENT_MIMES, MAX_ATTACHMENT_BYTES, MAX_MISSING_IDS,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::auth;
use crate::http::{query, read_body, respond, ApiError};
use crate::server::{lock, Server};

const ID_LEN: usize = 64;
// WHY: the stale-device window. An offline device's pending edit that links an image again still finds it.
const COLLECT_AFTER_MS: u64 = 90 * 24 * 60 * 60 * 1000;

pub(crate) async fn put(
    State(server): State<Arc<Server>>,
    UrlPath((space, id)): UrlPath<(String, String)>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let request = read_body::<AttachmentBody>(&headers, body).await;
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        check_id(&id)?;
        let attachment = request?;
        check(&id, &attachment)?;
        store(server, caller.space, &id, &attachment)?;
        Ok(Empty {})
    })
    .await
}

pub(crate) async fn get(
    State(server): State<Arc<Server>>,
    UrlPath((space, id)): UrlPath<(String, String)>,
    headers: HeaderMap,
) -> Response {
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        check_id(&id)?;
        load(server, caller.space, &id)?.ok_or_else(|| ApiError::not_found("no device has uploaded this attachment"))
    })
    .await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct MissingQuery {
    after: Option<String>,
    limit: Option<usize>,
}

/// Ids that live cards link and no device has uploaded: after a restore, the bytes a backup lacks for cards it holds,
/// which no push reports because no device re-pushes those cards (`PROTOCOL.md` §Server restore).
pub(crate) async fn list_missing(
    State(server): State<Arc<Server>>,
    UrlPath(space): UrlPath<String>,
    params: Result<Query<MissingQuery>, QueryRejection>,
    headers: HeaderMap,
) -> Response {
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        let params = query(params)?;
        let limit = params.limit.unwrap_or(MAX_MISSING_IDS).clamp(1, MAX_MISSING_IDS);
        let space = server.space(caller.space)?.ok_or_else(ApiError::unknown_space)?;
        let ids = lock(&space.reader)?
            .prepare(
                r#"
                SELECT DISTINCT r.attachment FROM attachment_refs r
                WHERE (?1 IS NULL OR r.attachment > ?1)
                  AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.id = r.attachment)
                ORDER BY r.attachment
                LIMIT ?2
                "#,
            )?
            .query_map(params![params.after, i64::try_from(limit).unwrap_or(i64::MAX)], |row| {
                row.get(0)
            })?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(MissingAttachments { ids })
    })
    .await
}

fn check_id(id: &str) -> Result<(), ApiError> {
    if id.len() == ID_LEN && id.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f')) {
        Ok(())
    } else {
        Err(ApiError::bad_request("an attachment id is 64 lowercase hex characters"))
    }
}

fn check(id: &str, attachment: &AttachmentBody) -> Result<(), ApiError> {
    if attachment.bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err(ApiError::too_large(format!(
            "an attachment is at most {MAX_ATTACHMENT_BYTES} bytes"
        )));
    }
    if !ATTACHMENT_MIMES.contains(&attachment.mime.as_str()) {
        return Err(ApiError::bad_request(format!(
            "`{}` is not an accepted attachment type",
            attachment.mime
        )));
    }
    if format!("{:x}", Sha256::digest(&attachment.bytes)) != id {
        return Err(ApiError::bad_request("the bytes do not hash to the attachment id"));
    }
    Ok(())
}

/// Writes the bytes to a temporary file outside the lock, then renames it into place and records it under the space
/// writer lock, so a stored row always has its file.
fn store(server: &Server, space_id: Uuid, id: &str, attachment: &AttachmentBody) -> Result<(), ApiError> {
    let space = server.space(space_id)?.ok_or_else(ApiError::unknown_space)?;
    if is_stored(&*lock(&space.reader)?, id)? {
        return Ok(());
    }
    let dir = server.attachments_dir(space_id);
    fs::create_dir_all(&dir).map_err(io_error)?;
    let staged = dir.join(format!(".{id}.{}.tmp", Uuid::new_v4()));
    write_synced(&staged, &attachment.bytes).map_err(io_error)?;

    let mut conn = lock(&space.writer)?;
    let tx = conn.transaction()?;
    if is_stored(&tx, id)? {
        return fs::remove_file(&staged).map_err(io_error);
    }
    fs::rename(&staged, dir.join(id)).map_err(io_error)?;
    File::open(&dir).and_then(|dir| dir.sync_all()).map_err(io_error)?;
    tx.execute(
        "INSERT INTO attachments (id, mime, size, width, height, stored_at, unlinked_since)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, CASE WHEN EXISTS (SELECT 1 FROM attachment_refs WHERE attachment = ?1)
                                              THEN NULL ELSE ?6 END)",
        params![
            id,
            attachment.mime,
            attachment.bytes.len(),
            attachment.width.map(|width| width.get()),
            attachment.height.map(|height| height.get()),
            server.now_ms()
        ],
    )?;
    tx.commit()?;
    Ok(())
}

fn load(server: &Server, space_id: Uuid, id: &str) -> Result<Option<AttachmentBody>, ApiError> {
    let space = server.space(space_id)?.ok_or_else(ApiError::unknown_space)?;
    let row = lock(&space.reader)?
        .query_row(
            "SELECT mime, width, height FROM attachments WHERE id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<u32>>(1)?,
                    row.get::<_, Option<u32>>(2)?,
                ))
            },
        )
        .optional()?;
    let Some((mime, width, height)) = row else {
        return Ok(None);
    };
    match fs::read(server.attachments_dir(space_id).join(id)) {
        Ok(bytes) => Ok(Some(AttachmentBody {
            mime,
            width: width.and_then(NonZeroU32::new),
            height: height.and_then(NonZeroU32::new),
            bytes,
        })),
        // WHY: a collection may remove the file between the row read and this one; the attachment is gone either way.
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(io_error(error)),
    }
}

/// Replaces the attachments `card` links with `ids`, and moves `unlinked_since` for every attachment that gained or
/// lost its last ref.
pub(crate) fn link(tx: &Connection, card: &str, ids: &[String], now_ms: u64) -> Result<(), ApiError> {
    let mut statement = tx.prepare("SELECT attachment FROM attachment_refs WHERE card = ?1")?;
    let previous = statement
        .query_map(params![card], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    tx.execute("DELETE FROM attachment_refs WHERE card = ?1", params![card])?;
    for id in ids {
        tx.execute(
            "INSERT OR IGNORE INTO attachment_refs (card, attachment) VALUES (?1, ?2)",
            params![card, id],
        )?;
    }
    for id in previous.iter().chain(ids) {
        tx.execute(
            "UPDATE attachments SET unlinked_since =
                 CASE WHEN EXISTS (SELECT 1 FROM attachment_refs WHERE attachment = ?1) THEN NULL
                      ELSE coalesce(unlinked_since, ?2) END
             WHERE id = ?1",
            params![id, now_ms],
        )?;
    }
    Ok(())
}

/// The ids a card `create` or `content` header links that the server holds no bytes for (`PROTOCOL.md` §Push
/// outcomes).
pub(crate) fn missing(conn: &Connection, header: &Header) -> Result<Vec<String>, ApiError> {
    if header.kind != Kind::Cards || !matches!(header.group, Some(Group::Create | Group::Content)) {
        return Ok(Vec::new());
    }
    let mut missing = Vec::new();
    for id in &header.refs.attachment_ids {
        if !is_stored(conn, id)? {
            missing.push(id.clone());
        }
    }
    Ok(missing)
}

/// Removes every attachment of the space that no card has linked for more than 90 days, under the space writer lock,
/// so a concurrent upload of the same id never loses its file.
///
/// INVARIANT: rows go before files. A file left behind by a failure is harmless; a row without its file would tell
/// pushes the bytes are stored, and no device would upload them again.
pub(crate) fn collect(server: &Server, space_id: Uuid) -> Result<(), ApiError> {
    let space = server.space(space_id)?.ok_or_else(ApiError::unknown_space)?;
    let cutoff = server.now_ms().saturating_sub(COLLECT_AFTER_MS);
    let dir = server.attachments_dir(space_id);
    let mut conn = lock(&space.writer)?;
    let tx = conn.transaction()?;
    let collected = tx
        .prepare("DELETE FROM attachments WHERE unlinked_since < ?1 RETURNING id")?
        .query_map(params![cutoff], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    tx.commit()?;
    for id in collected {
        match fs::remove_file(dir.join(id)) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(io_error(error)),
        }
    }
    Ok(())
}

fn is_stored(conn: &Connection, id: &str) -> Result<bool, ApiError> {
    Ok(conn
        .query_row("SELECT 1 FROM attachments WHERE id = ?1", params![id], |_| Ok(()))
        .optional()?
        .is_some())
}

fn write_synced(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut file = File::create(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

fn io_error(error: io::Error) -> ApiError {
    ApiError::internal(format!("attachment store: {error}"))
}
