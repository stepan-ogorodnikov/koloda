//! Pairing codes: issue, preview, and claim (`PROTOCOL.md` §Pairing).
//!
//! A code is 10 Crockford base32 characters, single use, valid for 10 minutes; only its hash is stored.
//! Wrong codes are limited per client address and server-wide, because a wrong code names no space.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{ConnectInfo, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use axum::Extension;
use koloda_sync_proto::transport::{
    code_hash, ClaimPairing, Enrollment, ErrorCode, IssuePairing, Pairing, PairingClaim, PairingPreview,
    PreviewPairing, MAX_HINT_BYTES,
};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::auth::{self, SpaceAuth};
use crate::http::{read_body, respond, ApiError};
use crate::log;
use crate::server::{lock, Server};
use crate::spaces::checked_name;

pub(crate) const CODE_TTL_MS: u64 = 10 * 60 * 1000;
pub(crate) const GUESS_WINDOW_MS: u64 = 60 * 1000;
pub(crate) const GUESSES_PER_ADDRESS: u32 = 10;
pub(crate) const GUESSES_SERVER_WIDE: u32 = 100;
const CODE_CHARS: usize = 10;
const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Failed previews and claims in the current fixed window.
#[derive(Default)]
pub(crate) struct Guesses {
    window_start: u64,
    server_wide: u32,
    by_address: HashMap<IpAddr, u32>,
}

type Peer = Option<Extension<ConnectInfo<SocketAddr>>>;

struct Code {
    hash: Vec<u8>,
    space: Uuid,
    hint: Option<Vec<u8>>,
    claim: Option<Claim>,
}

struct Claim {
    nonce: Vec<u8>,
    device: Uuid,
}

pub(crate) async fn issue(
    State(server): State<Arc<Server>>,
    Path(space): Path<String>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let request = read_body::<IssuePairing>(&headers, body).await;
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device_or_setup(server, scope, headers, &space)?;
        issue_code(server, &caller, request?)
    })
    .await
}

pub(crate) async fn preview(State(server): State<Arc<Server>>, peer: Peer, headers: HeaderMap, body: Body) -> Response {
    let request = read_body::<PreviewPairing>(&headers, body).await;
    respond(server, headers, move |server, _, _| {
        guarded(server, address(peer), || preview_code(server, &request?))
    })
    .await
}

pub(crate) async fn claim(State(server): State<Arc<Server>>, peer: Peer, headers: HeaderMap, body: Body) -> Response {
    let request = read_body::<ClaimPairing>(&headers, body).await;
    respond(server, headers, move |server, _, _| {
        guarded(server, address(peer), || claim_code(server, request?))
    })
    .await
}

impl Server {
    /// A break-glass pairing code for `space`, as the setup token issues one; `koloda-server pair` prints it.
    pub fn issue_pairing(&self, space: Uuid) -> Result<Pairing, ApiError> {
        if !auth::space_exists(&*self.server_db()?, space)? {
            return Err(ApiError::unknown_space());
        }
        issue_code(self, &SpaceAuth { space, device: None }, IssuePairing::default())
    }
}

fn issue_code(server: &Server, caller: &SpaceAuth, request: IssuePairing) -> Result<Pairing, ApiError> {
    if let Some(hint) = &request.hint {
        if hint.len() > MAX_HINT_BYTES {
            return Err(ApiError::too_large(format!(
                "the setup hint is over {MAX_HINT_BYTES} bytes"
            )));
        }
    }
    let random: [u8; CODE_CHARS] = auth::random_bytes().map_err(|error| ApiError::internal(error.to_string()))?;
    // WHY: 32 divides 256, so masking each byte to 5 bits picks every character with equal odds.
    let code: String = random
        .iter()
        .filter_map(|byte| ALPHABET.get(usize::from(byte & 31)).map(|&letter| char::from(letter)))
        .collect();
    let now = server.now_ms();
    let expires_at = now + CODE_TTL_MS;
    let conn = server.server_db()?;
    conn.execute("DELETE FROM pairings WHERE expires_at < ?1", params![now])?;
    conn.execute(
        "INSERT INTO pairings (code_hash, space_id, issuer, expires_at, hint) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            code_hash(&code).to_vec(),
            caller.space,
            caller.device,
            expires_at,
            request.hint
        ],
    )?;
    Ok(Pairing { code, expires_at })
}

fn preview_code(server: &Server, request: &PreviewPairing) -> Result<PairingPreview, ApiError> {
    let conn = server.server_db()?;
    let code = live_code(&conn, &request.code, server.now_ms())?
        .filter(|code| code.claim.is_none())
        .ok_or_else(failed)?;
    let name: String = conn.query_row("SELECT name FROM spaces WHERE id = ?1", params![code.space], |row| {
        row.get(0)
    })?;
    drop(conn);
    let space = server.space(code.space)?.ok_or_else(ApiError::unknown_space)?;
    let (counts, bytes) = log::size(&*lock(&space.reader)?)?;
    Ok(PairingPreview {
        space_id: code.space.into_bytes(),
        name,
        epoch: server.space_epoch(code.space)?.into_bytes(),
        counts,
        bytes,
    })
}

fn claim_code(server: &Server, request: ClaimPairing) -> Result<PairingClaim, ApiError> {
    auth::require_token(&request.token)?;
    let name = checked_name("device name", &request.name)?;
    let hash = auth::token_hash(&request.token).to_vec();
    let now = server.now_ms();
    let mut conn = server.server_db()?;
    conn.execute("DELETE FROM pairings WHERE expires_at < ?1", params![now])?;
    let code = live_code(&conn, &request.code, now)?.ok_or_else(failed)?;
    let epoch = server.space_epoch(code.space)?.into_bytes();
    let enrollment = |device: Uuid| PairingClaim {
        enrollment: Enrollment {
            space_id: code.space.into_bytes(),
            device_id: device.into_bytes(),
            epoch,
        },
        hint: code.hint.clone(),
    };
    if let Some(claim) = &code.claim {
        // INVARIANT: a used code answers only its own claim's retry, and only when the token hashes to that
        // device. Any other caller, and a different token, see an unknown code. Neither writes.
        let same_token = device_token_hash(&conn, claim.device)?.as_deref() == Some(hash.as_slice());
        return if claim.nonce.as_slice() == request.nonce.as_slice() && same_token {
            Ok(enrollment(claim.device))
        } else {
            Err(failed())
        };
    }

    let device = Uuid::new_v4();
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO devices (id, space_id, token_hash, name, platform, created_at, last_seen)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![device, code.space, hash, name, request.platform.as_wire(), now],
    )?;
    tx.execute(
        "UPDATE pairings SET claim_nonce = ?1, claim_device = ?2 WHERE code_hash = ?3",
        params![request.nonce.to_vec(), device, code.hash],
    )?;
    tx.commit()?;
    Ok(enrollment(device))
}

fn device_token_hash(conn: &Connection, device: Uuid) -> Result<Option<Vec<u8>>, ApiError> {
    Ok(conn
        .query_row("SELECT token_hash FROM devices WHERE id = ?1", params![device], |row| {
            row.get(0)
        })
        .optional()?)
}

fn live_code(conn: &Connection, code: &str, now: u64) -> Result<Option<Code>, ApiError> {
    let hash = code_hash(code).to_vec();
    let row = conn
        .query_row(
            "SELECT space_id, hint, claim_nonce, claim_device
             FROM pairings WHERE code_hash = ?1 AND expires_at >= ?2",
            params![hash, now],
            |row| {
                let claim = match (row.get(2)?, row.get(3)?) {
                    (Some(nonce), Some(device)) => Some(Claim { nonce, device }),
                    _ => None,
                };
                Ok(Code {
                    hash: hash.clone(),
                    space: row.get(0)?,
                    hint: row.get(1)?,
                    claim,
                })
            },
        )
        .optional()?;
    Ok(row)
}

fn guarded<T>(server: &Server, address: IpAddr, attempt: impl FnOnce() -> Result<T, ApiError>) -> Result<T, ApiError> {
    lock(&server.guesses)?.check(server.now_ms(), address)?;
    let result = attempt();
    if matches!(&result, Err(error) if error.code() == ErrorCode::PairingFailed) {
        lock(&server.guesses)?.record_failure(address);
    }
    result
}

fn address(peer: Peer) -> IpAddr {
    // WHY: a request without a socket peer (in-process callers) shares one bucket instead of escaping the limit.
    peer.map_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED), |Extension(ConnectInfo(peer))| {
        peer.ip()
    })
}

fn failed() -> ApiError {
    ApiError::new(
        StatusCode::NOT_FOUND,
        ErrorCode::PairingFailed,
        "unknown, expired, or used pairing code",
    )
}

impl Guesses {
    fn check(&mut self, now: u64, address: IpAddr) -> Result<(), ApiError> {
        if now >= self.window_start.saturating_add(GUESS_WINDOW_MS) {
            *self = Guesses {
                window_start: now,
                ..Guesses::default()
            };
        }
        let by_address = self.by_address.get(&address).copied().unwrap_or(0);
        if by_address >= GUESSES_PER_ADDRESS || self.server_wide >= GUESSES_SERVER_WIDE {
            return Err(ApiError::new(
                StatusCode::TOO_MANY_REQUESTS,
                ErrorCode::RateLimited,
                "too many wrong pairing codes; try again in a minute",
            ));
        }
        Ok(())
    }

    fn record_failure(&mut self, address: IpAddr) {
        *self.by_address.entry(address).or_default() += 1;
        self.server_wide += 1;
    }
}
