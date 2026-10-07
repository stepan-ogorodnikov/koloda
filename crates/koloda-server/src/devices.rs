//! Devices of a space: records, revocation (detach when a device revokes itself), and fork (`PROTOCOL.md` §Devices).
//!
//! Any enrolled device of the space may read and revoke any other (§Trust model).

use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::Response;
use koloda_sync_proto::transport::{DeviceInfo, DeviceList, Empty, Enrollment, Platform};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::auth::{self, DeviceAuth};
use crate::bootstrap;
use crate::http::{respond, ApiError};
use crate::log;
use crate::server::{lock, Server};

const DEVICE_COLUMNS: &str =
    "id, name, platform, created_at, last_seen, cursor_hot, cursor_cold, revoked_at, rebase_required";

const DAY_MS: u64 = 24 * 60 * 60 * 1000;
/// A device unseen this long is stale: it must re-bootstrap, and it stops pinning GC (`PROTOCOL.md` §Devices).
pub(crate) const STALE_AFTER_MS: u64 = 90 * DAY_MS;
/// A record another was forked from goes stale sooner, so a rolled-back file's old record does not pin GC for long.
pub(crate) const FORKED_STALE_AFTER_MS: u64 = DAY_MS;

struct DeviceRow {
    id: Uuid,
    name: String,
    platform: String,
    created_at: u64,
    last_seen: u64,
    cursor_hot: u64,
    cursor_cold: u64,
    revoked_at: Option<u64>,
    rebase_required: bool,
}

pub(crate) async fn list(State(server): State<Arc<Server>>, Path(space): Path<String>, headers: HeaderMap) -> Response {
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        let rows = {
            let conn = server.server_db()?;
            let mut statement = conn.prepare(&format!(
                "SELECT {DEVICE_COLUMNS} FROM devices WHERE space_id = ?1 ORDER BY created_at, id"
            ))?;
            let rows = statement
                .query_map(params![caller.space], device_row)?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        let devices = rows
            .into_iter()
            .map(|row| device_info(server, caller.space, row))
            .collect::<Result<_, _>>()?;
        Ok(DeviceList { devices })
    })
    .await
}

pub(crate) async fn get(
    State(server): State<Arc<Server>>,
    Path((space, device)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        let id = Uuid::parse_str(&device).map_err(|_parse| not_found())?;
        let row = find(&*server.server_db()?, caller.space, id)?.ok_or_else(not_found)?;
        device_info(server, caller.space, row)
    })
    .await
}

pub(crate) async fn revoke(
    State(server): State<Arc<Server>>,
    Path((space, device)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        let id = Uuid::parse_str(&device).map_err(|_parse| not_found())?;
        revoke_device(server, &caller, id)?;
        Ok(Empty {})
    })
    .await
}

pub(crate) async fn fork(State(server): State<Arc<Server>>, Path(space): Path<String>, headers: HeaderMap) -> Response {
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        fork_device(server, &caller)
    })
    .await
}

fn revoke_device(server: &Server, caller: &DeviceAuth, id: Uuid) -> Result<(), ApiError> {
    let now = server.now_ms();
    {
        let mut conn = server.server_db()?;
        find(&conn, caller.space, id)?.ok_or_else(not_found)?;
        let tx = conn.transaction()?;
        tx.execute(
            "UPDATE devices SET revoked_at = coalesce(revoked_at, ?1) WHERE id = ?2",
            params![now, id],
        )?;
        tx.execute(
            "DELETE FROM pairings WHERE issuer = ?1 AND claim_nonce IS NULL",
            params![id],
        )?;
        tx.commit()?;
    }
    // INVARIANT: the revocation commits first; a revoked device then no longer pins versions with a lease.
    let space = server.space(caller.space)?.ok_or_else(ApiError::unknown_space)?;
    let mut conn = lock(&space.writer)?;
    let tx = conn.transaction()?;
    bootstrap::release_device(&tx, id)?;
    tx.commit()?;
    Ok(())
}

fn fork_device(server: &Server, caller: &DeviceAuth) -> Result<Enrollment, ApiError> {
    let now = server.now_ms();
    let device = Uuid::new_v4();
    let token = auth::new_token().map_err(|error| ApiError::internal(error.to_string()))?;
    server.server_db()?.execute(
        "INSERT INTO devices (id, space_id, token_hash, name, platform, created_at, last_seen, forked_from)
         SELECT ?1, space_id, ?2, name, platform, ?3, ?3, id FROM devices WHERE id = ?4",
        params![device, auth::token_hash(&token).to_vec(), now, caller.id],
    )?;
    Ok(Enrollment {
        space_id: caller.space.into_bytes(),
        device_id: device.into_bytes(),
        token,
        epoch: server.space_epoch(caller.space)?.into_bytes(),
    })
}

fn find(conn: &Connection, space: Uuid, id: Uuid) -> Result<Option<DeviceRow>, ApiError> {
    Ok(conn
        .query_row(
            &format!("SELECT {DEVICE_COLUMNS} FROM devices WHERE id = ?1 AND space_id = ?2"),
            params![id, space],
            device_row,
        )
        .optional()?)
}

fn device_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DeviceRow> {
    Ok(DeviceRow {
        id: row.get(0)?,
        name: row.get(1)?,
        platform: row.get(2)?,
        created_at: row.get(3)?,
        last_seen: row.get(4)?,
        cursor_hot: row.get(5)?,
        cursor_cold: row.get(6)?,
        revoked_at: row.get(7)?,
        rebase_required: row.get(8)?,
    })
}

fn device_info(server: &Server, space: Uuid, row: DeviceRow) -> Result<DeviceInfo, ApiError> {
    let space = server.space(space)?.ok_or_else(ApiError::unknown_space)?;
    let progress = log::sender_progress(&*lock(&space.reader)?, row.id)?;
    Ok(DeviceInfo {
        id: row.id.into_bytes(),
        name: row.name,
        platform: Platform::from_wire(&row.platform).map_err(|error| ApiError::internal(error.to_string()))?,
        created_at: row.created_at,
        last_seen: row.last_seen,
        last_sender_seq: progress.map_or(0, |(seq, _)| seq),
        last_sender_digest: progress.map(|(_, digest)| digest),
        cursor_hot: row.cursor_hot,
        cursor_cold: row.cursor_cold,
        revoked_at: row.revoked_at,
        rebase_required: row.rebase_required,
    })
}

/// The lowest `hot` cursor among the space's active devices: not revoked, not flagged, and not stale by `last_seen`,
/// so a device that never calls again stops pinning GC without being marked. `None` when no device is active.
pub(crate) fn lowest_active_cursor(conn: &Connection, space: Uuid, now: u64) -> Result<Option<u64>, ApiError> {
    let mut statement = conn.prepare(
        "SELECT d.cursor_hot, d.last_seen, EXISTS (SELECT 1 FROM devices f WHERE f.forked_from = d.id)
         FROM devices d WHERE d.space_id = ?1 AND d.revoked_at IS NULL AND d.rebase_required = 0",
    )?;
    let rows = statement
        .query_map(params![space], |row| {
            Ok((row.get::<_, u64>(0)?, row.get::<_, u64>(1)?, row.get::<_, bool>(2)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows
        .into_iter()
        .filter(|(_, last_seen, is_forked_from)| !is_stale(*last_seen, *is_forked_from, now))
        .map(|(cursor_hot, _, _)| cursor_hot)
        .min())
}

pub(crate) fn is_stale(last_seen: u64, is_forked_from: bool, now: u64) -> bool {
    let window = if is_forked_from {
        FORKED_STALE_AFTER_MS
    } else {
        STALE_AFTER_MS
    };
    now.saturating_sub(last_seen) > window
}

fn not_found() -> ApiError {
    ApiError::not_found("no such device in this space")
}
