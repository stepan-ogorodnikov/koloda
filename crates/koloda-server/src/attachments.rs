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
use axum::extract::{Path as UrlPath, State};
use axum::http::HeaderMap;
use axum::response::Response;
use koloda_sync_proto::transport::{AttachmentBody, Empty, ATTACHMENT_MIMES, MAX_ATTACHMENT_BYTES};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::auth;
use crate::http::{read_body, respond, ApiError};
use crate::server::{lock, Server};

const ID_LEN: usize = 64;

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
        "INSERT INTO attachments (id, mime, size, width, height, stored_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
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
