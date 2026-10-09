//! Devices of a space: records, revocation (detach when a device revokes itself), and fork (`PROTOCOL.md` §Devices).
//!
//! Any enrolled device of the space may read and revoke any other (§Trust model).

use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::Response;
use koloda_sync_proto::transport::{DeviceInfo, DeviceList, Empty, Enrollment, ForkDevice, Platform};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::auth::{self, DeviceAuth};
use crate::bootstrap;
use crate::db::is_constraint;
use crate::http::{read_body, respond, ApiError};
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

pub(crate) async fn fork(
    State(server): State<Arc<Server>>,
    Path(space): Path<String>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let request = read_body::<ForkDevice>(&headers, body).await;
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        fork_device(server, &caller, request?)
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
    server.sockets()?.close(id);
    // INVARIANT: the revocation commits first; a revoked device then no longer pins versions with a lease.
    let space = server.space(caller.space)?.ok_or_else(ApiError::unknown_space)?;
    let mut conn = lock(&space.writer)?;
    let tx = conn.transaction()?;
    bootstrap::release_device(&tx, id)?;
    tx.commit()?;
    Ok(())
}

// INVARIANT: a fork is idempotent by nonce and token. A retry after a lost reply returns the same device and writes
// nothing. A different token for that nonce is refused and writes nothing, so one file never makes two records and
// never replaces a token the other copy kept.
fn fork_device(server: &Server, caller: &DeviceAuth, request: ForkDevice) -> Result<Enrollment, ApiError> {
    auth::require_token(&request.token)?;
    let hash = auth::token_hash(&request.token).to_vec();
    let now = server.now_ms();
    let device = {
        let mut conn = server.server_db()?;
        match same_fork(&conn, caller.id, &request.nonce, &hash)? {
            Some(device) => device,
            None => match insert_fork(&mut conn, caller, &request.nonce, &hash, now)? {
                Some(device) => device,
                // The unique index lost to a request that committed first.
                None => same_fork(&conn, caller.id, &request.nonce, &hash)?
                    .ok_or_else(|| ApiError::bad_request("the token is already enrolled"))?,
            },
        }
    };
    Ok(Enrollment {
        space_id: caller.space.into_bytes(),
        device_id: device.into_bytes(),
        epoch: server.space_epoch(caller.space)?.into_bytes(),
    })
}

/// The fork this nonce already recorded, when `hash` is that device's token hash.
fn same_fork(conn: &Connection, from: Uuid, nonce: &[u8; 16], hash: &[u8]) -> Result<Option<Uuid>, ApiError> {
    let row: Option<(Uuid, Vec<u8>)> = conn
        .query_row(
            "SELECT id, token_hash FROM devices WHERE forked_from = ?1 AND fork_nonce = ?2",
            params![from, nonce.as_slice()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    match row {
        Some((device, stored)) if stored == hash => Ok(Some(device)),
        Some(_) => Err(ApiError::bad_request("the nonce was used with another token")),
        None => Ok(None),
    }
}

/// Inserts the fork, or `None` when a unique index says another request did. The transaction ends before return.
fn insert_fork(
    conn: &mut Connection,
    caller: &DeviceAuth,
    nonce: &[u8; 16],
    hash: &[u8],
    now: u64,
) -> Result<Option<Uuid>, ApiError> {
    let device = Uuid::new_v4();
    let tx = conn.transaction()?;
    if let Err(error) = tx.execute(
        "INSERT INTO devices
             (id, space_id, token_hash, name, platform, created_at, last_seen, forked_from, fork_nonce)
         SELECT ?1, space_id, ?2, name, platform, ?3, ?3, id, ?5 FROM devices WHERE id = ?4",
        params![device, hash, now, caller.id, nonce.as_slice()],
    ) {
        return if is_constraint(&error) {
            Ok(None)
        } else {
            Err(error.into())
        };
    }
    tx.commit()?;
    Ok(Some(device))
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

/// What an active device contributes to a decision about the whole space.
pub(crate) struct Active {
    pub(crate) name: String,
    pub(crate) cursor_hot: u64,
    /// The `koloda-schemas` value the device last sent; `None` when it never advertised.
    pub(crate) schemas: Option<String>,
}

/// The space's active devices: not revoked, not flagged, and not stale by `last_seen`, so a device that never calls
/// again stops pinning GC and schema raises without being marked.
pub(crate) fn active(conn: &Connection, space: Uuid, now: u64) -> Result<Vec<Active>, ApiError> {
    let mut statement = conn.prepare(
        "SELECT d.name, d.cursor_hot, d.schemas, d.last_seen,
                EXISTS (SELECT 1 FROM devices f WHERE f.forked_from = d.id)
         FROM devices d WHERE d.space_id = ?1 AND d.revoked_at IS NULL AND d.rebase_required = 0",
    )?;
    let rows = statement
        .query_map(params![space], |row| {
            Ok((
                Active {
                    name: row.get(0)?,
                    cursor_hot: row.get(1)?,
                    schemas: row.get(2)?,
                },
                row.get::<_, u64>(3)?,
                row.get::<_, bool>(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows
        .into_iter()
        .filter(|(_, last_seen, is_forked_from)| !is_stale(*last_seen, *is_forked_from, now))
        .map(|(device, _, _)| device)
        .collect())
}

/// The lowest `hot` cursor among the space's active devices, or `None` when no device is active.
pub(crate) fn lowest_active_cursor(conn: &Connection, space: Uuid, now: u64) -> Result<Option<u64>, ApiError> {
    Ok(active(conn, space, now)?
        .into_iter()
        .map(|device| device.cursor_hot)
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
