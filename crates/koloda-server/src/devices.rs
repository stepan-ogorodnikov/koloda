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
use crate::server::Server;

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

fn read_device(server: &Server, space: Uuid, id: Uuid) -> Result<Option<DeviceInfo>, ApiError> {
    let conn = server.server_db()?;
    let row = conn
        .query_row(
            "SELECT name, platform, created_at, last_seen FROM devices WHERE id = ?1 AND space_id = ?2",
            params![id, space],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u64>(2)?,
                    row.get::<_, u64>(3)?,
                ))
            },
        )
        .optional()?;
    let Some((name, platform, created_at, last_seen)) = row else {
        return Ok(None);
    };
    Ok(Some(DeviceInfo {
        id: id.into_bytes(),
        name,
        platform: Platform::from_wire(&platform).map_err(|error| ApiError::internal(error.to_string()))?,
        created_at,
        last_seen,
    }))
}
