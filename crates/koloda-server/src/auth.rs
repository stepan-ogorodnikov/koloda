//! Bearer tokens: 256 random bits as lowercase hex, stored only as their SHA-256.
//!
//! The setup token creates and lists spaces. A device token names one device in one space.

use axum::http::header::AUTHORIZATION;
use axum::http::{HeaderMap, StatusCode};
use koloda_sync_proto::transport::ErrorCode;
use rusqlite::{params, OptionalExtension};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::http::{ApiError, Scope};
use crate::server::Server;

const TOKEN_BYTES: usize = 32;
const BEARER: &str = "Bearer ";

pub(crate) struct DeviceAuth {
    pub(crate) space: Uuid,
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
    let stored: Vec<u8> = server
        .server_db()?
        .query_row("SELECT token_hash FROM setup WHERE id = 1", [], |row| row.get(0))?;
    if stored == token_hash(token) {
        Ok(())
    } else {
        Err(unauthorized())
    }
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
    let device: Option<(Uuid, Uuid)> = match bearer(headers) {
        Some(token) => conn
            .query_row(
                "SELECT id, space_id FROM devices WHERE token_hash = ?1",
                params![token_hash(token).to_vec()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?,
        None => None,
    };
    let Some((id, device_space)) = device else {
        if let Some(space_id) = space_id {
            let exists = conn
                .query_row("SELECT 1 FROM spaces WHERE id = ?1", params![space_id], |_| Ok(()))
                .optional()?
                .is_some();
            if exists {
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
    conn.execute(
        "UPDATE devices SET last_seen = ?1 WHERE id = ?2",
        params![server.now_ms(), id],
    )?;
    scope.space = Some(device_space);
    scope.device = Some(id);
    Ok(DeviceAuth { space: device_space })
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix(BEARER)
        .filter(|token| !token.is_empty())
}
