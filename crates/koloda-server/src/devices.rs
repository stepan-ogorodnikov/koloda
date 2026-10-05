//! Device records of a space, read with a device token of that space.

use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::Response;
use koloda_sync_proto::transport::{DeviceInfo, Platform};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use crate::auth;
use crate::http::{respond, ApiError};
use crate::log;
use crate::server::{lock, Server};

pub(crate) async fn get(
    State(server): State<Arc<Server>>,
    Path((space, device)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        let not_found = || ApiError::not_found("no such device in this space");
        let id = Uuid::parse_str(&device).map_err(|_parse| not_found())?;
        read_device(server, caller.space, id)?.ok_or_else(not_found)
    })
    .await
}

struct DeviceRow {
    name: String,
    platform: String,
    created_at: u64,
    last_seen: u64,
    cursor_hot: u64,
    cursor_cold: u64,
}

fn read_device(server: &Server, space: Uuid, id: Uuid) -> Result<Option<DeviceInfo>, ApiError> {
    let conn = server.server_db()?;
    let row = conn
        .query_row(
            "SELECT name, platform, created_at, last_seen, cursor_hot, cursor_cold
             FROM devices WHERE id = ?1 AND space_id = ?2",
            params![id, space],
            |row| {
                Ok(DeviceRow {
                    name: row.get(0)?,
                    platform: row.get(1)?,
                    created_at: row.get(2)?,
                    last_seen: row.get(3)?,
                    cursor_hot: row.get(4)?,
                    cursor_cold: row.get(5)?,
                })
            },
        )
        .optional()?;
    drop(conn);
    let Some(row) = row else {
        return Ok(None);
    };
    let space = server.space(space)?.ok_or_else(ApiError::unknown_space)?;
    let progress = log::sender_progress(&*lock(&space.reader)?, id)?;
    Ok(Some(DeviceInfo {
        id: id.into_bytes(),
        name: row.name,
        platform: Platform::from_wire(&row.platform).map_err(|error| ApiError::internal(error.to_string()))?,
        created_at: row.created_at,
        last_seen: row.last_seen,
        last_sender_seq: progress.map_or(0, |(seq, _)| seq),
        last_sender_digest: progress.map(|(_, digest)| digest),
        cursor_hot: row.cursor_hot,
        cursor_cold: row.cursor_cold,
    }))
}
