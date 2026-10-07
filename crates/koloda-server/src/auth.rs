//! Bearer tokens: 256 random bits as lowercase hex, stored only as their SHA-256.
//!
//! The setup token creates and lists spaces. A device token names one device in one space.

use axum::http::header::AUTHORIZATION;
use axum::http::{HeaderMap, StatusCode};
use koloda_sync_proto::transport::ErrorCode;
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::devices;
use crate::http::{ApiError, Scope};
use crate::server::Server;

const TOKEN_BYTES: usize = 32;
const BEARER: &str = "Bearer ";

pub(crate) struct DeviceAuth {
    pub(crate) id: Uuid,
    pub(crate) space: Uuid,
    pub(crate) is_rebase_required: bool,
}

/// A caller that may act on a space with a device token of that space, or with the setup token for break-glass.
pub(crate) struct SpaceAuth {
    pub(crate) space: Uuid,
    pub(crate) device: Option<Uuid>,
}

pub(crate) fn new_token() -> Result<String, getrandom::Error> {
    let bytes: [u8; TOKEN_BYTES] = random_bytes()?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

pub(crate) fn random_bytes<const N: usize>() -> Result<[u8; N], getrandom::Error> {
    let mut bytes = [0; N];
    getrandom::getrandom(&mut bytes)?;
    Ok(bytes)
}

pub(crate) fn token_hash(token: &str) -> [u8; 32] {
    Sha256::digest(token.as_bytes()).into()
}

pub(crate) fn require_setup(server: &Server, headers: &HeaderMap) -> Result<(), ApiError> {
    let unauthorized = || {
        ApiError::new(
            StatusCode::UNAUTHORIZED,
            ErrorCode::Unauthorized,
            "setup token required",
        )
    };
    let token = bearer(headers).ok_or_else(unauthorized)?;
    if is_setup_token(server, token)? {
        Ok(())
    } else {
        Err(unauthorized())
    }
}

pub(crate) fn require_device_or_setup(
    server: &Server,
    scope: &mut Scope,
    headers: &HeaderMap,
    space: &str,
) -> Result<SpaceAuth, ApiError> {
    if let Some(token) = bearer(headers) {
        if is_setup_token(server, token)? {
            let space = Uuid::parse_str(space).map_err(|_invalid| ApiError::unknown_space())?;
            if !space_exists(&*server.server_db()?, space)? {
                return Err(ApiError::unknown_space());
            }
            scope.space = Some(space);
            return Ok(SpaceAuth { space, device: None });
        }
    }
    let device = require_device(server, scope, headers, space)?;
    Ok(SpaceAuth {
        space: device.space,
        device: Some(device.id),
    })
}

/// Resolves a device token for a request on `/v1/spaces/{space}/...` and records the caller in `scope`.
///
/// INVARIANT: a token of another space answers exactly like a missing space, so a device cannot probe for spaces.
pub(crate) fn require_device(
    server: &Server,
    scope: &mut Scope,
    headers: &HeaderMap,
    space: &str,
) -> Result<DeviceAuth, ApiError> {
    let space_id = Uuid::parse_str(space).ok();
    let conn = server.server_db()?;
    let device: Option<(Uuid, Uuid, Option<u64>, u64, bool, bool)> = match bearer(headers) {
        Some(token) => conn
            .query_row(
                "SELECT d.id, d.space_id, d.revoked_at, d.last_seen, d.rebase_required,
                        EXISTS (SELECT 1 FROM devices f WHERE f.forked_from = d.id)
                 FROM devices d WHERE d.token_hash = ?1",
                params![token_hash(token).to_vec()],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .optional()?,
        None => None,
    };
    let Some((id, device_space, revoked_at, last_seen, is_flagged, is_forked_from)) = device else {
        if let Some(space_id) = space_id {
            if space_exists(&conn, space_id)? {
                scope.space = Some(space_id);
            }
        }
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            ErrorCode::UnknownDevice,
            "unknown device token",
        ));
    };
    if space_id != Some(device_space) {
        return Err(ApiError::unknown_space());
    }
    if revoked_at.is_some() {
        // WHY: a revoked device still learns the epoch, so it can tell revocation from a restore it predates.
        scope.space = Some(device_space);
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            ErrorCode::Revoked,
            "this device was revoked",
        ));
    }
    // INVARIANT: staleness reads `last_seen` before this request refreshes it, and the flag outlives the refresh, so
    // a device back from a long absence re-bootstraps before it pushes (PROTOCOL.md, Devices).
    let now = server.now_ms();
    let is_rebase_required = is_flagged || devices::is_stale(last_seen, is_forked_from, now);
    conn.execute(
        "UPDATE devices SET last_seen = ?1, rebase_required = ?2 WHERE id = ?3",
        params![now, is_rebase_required, id],
    )?;
    scope.space = Some(device_space);
    scope.device = Some(id);
    Ok(DeviceAuth {
        id,
        space: device_space,
        is_rebase_required,
    })
}

fn is_setup_token(server: &Server, token: &str) -> Result<bool, ApiError> {
    let stored: Vec<u8> = server
        .server_db()?
        .query_row("SELECT token_hash FROM setup WHERE id = 1", [], |row| row.get(0))?;
    Ok(stored == token_hash(token))
}

fn space_exists(conn: &Connection, space: Uuid) -> Result<bool, ApiError> {
    Ok(conn
        .query_row("SELECT 1 FROM spaces WHERE id = ?1", params![space], |_| Ok(()))
        .optional()?
        .is_some())
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix(BEARER)
        .filter(|token| !token.is_empty())
}
