//! Spaces: creation, which enrolls the creator, and the list. Both need the setup token.

use std::sync::Arc;

use axum::body::Body;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::Response;
use koloda_sync_proto::transport::{CreateSpace, Enrollment, SpaceList, SpaceSummary, MAX_NAME_CHARS};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::auth;
use crate::db::is_constraint;
use crate::http::{read_body, respond, ApiError};
use crate::server::Server;

pub(crate) const REPLAY_WINDOW_MS: u64 = 10 * 60 * 1000;

pub(crate) async fn create(State(server): State<Arc<Server>>, headers: HeaderMap, body: Body) -> Response {
    let request = read_body::<CreateSpace>(&headers, body).await;
    respond(server, headers, move |server, _, headers| {
        auth::require_setup(server, headers)?;
        create_space(server, request?)
    })
    .await
}

pub(crate) async fn list(State(server): State<Arc<Server>>, headers: HeaderMap) -> Response {
    respond(server, headers, |server, _, headers| {
        auth::require_setup(server, headers)?;
        list_spaces(server)
    })
    .await
}

fn create_space(server: &Server, request: CreateSpace) -> Result<Enrollment, ApiError> {
    let name = checked_name("space name", &request.name)?;
    let device_name = checked_name("device name", &request.device_name)?;
    auth::require_token(&request.token)?;
    let hash = auth::token_hash(&request.token).to_vec();
    let now = server.now_ms();
    let mut conn = server.server_db()?;
    conn.execute("DELETE FROM space_creations WHERE expires_at < ?1", params![now])?;
    // INVARIANT: a known nonce is answered from its record only when the token hashes to that device's hash.
    // Anything else writes nothing.
    if let Some(enrollment) = same_creation(&conn, &request.nonce, &hash)? {
        return Ok(enrollment);
    }

    let space_id = Uuid::new_v4();
    let epoch = Uuid::new_v4();
    let device_id = Uuid::new_v4();
    // INVARIANT: the space database exists before `server.db` names it, so a crash in between leaves an unreachable
    // file and never a space row without its log.
    server.create_space_db(space_id, epoch, now)?;
    let creation = Creation {
        space_id,
        epoch,
        device_id,
        name,
        device_name,
        platform: request.platform.as_wire(),
        nonce: &request.nonce,
        hash: &hash,
        now,
    };
    if let Some(enrollment) = insert_creation(&mut conn, &creation)? {
        return Ok(enrollment);
    }
    // The unique index lost to a request that committed first. Re-read it; write nothing more.
    same_creation(&conn, &request.nonce, &hash)?.ok_or_else(|| ApiError::bad_request("the token is already enrolled"))
}

struct Creation<'a> {
    space_id: Uuid,
    epoch: Uuid,
    device_id: Uuid,
    name: &'a str,
    device_name: &'a str,
    platform: &'a str,
    nonce: &'a [u8; 16],
    hash: &'a [u8],
    now: u64,
}

/// Inserts the space, or `None` when a unique index says another request did. The transaction ends before return,
/// so the caller can re-read.
fn insert_creation(conn: &mut Connection, creation: &Creation<'_>) -> Result<Option<Enrollment>, ApiError> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO spaces (id, name, created_at) VALUES (?1, ?2, ?3)",
        params![creation.space_id, creation.name, creation.now],
    )?;
    if let Err(error) = tx.execute(
        "INSERT INTO devices (id, space_id, token_hash, name, platform, created_at, last_seen)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            creation.device_id,
            creation.space_id,
            creation.hash,
            creation.device_name,
            creation.platform,
            creation.now
        ],
    ) {
        return raced(error);
    }
    if let Err(error) = tx.execute(
        "INSERT INTO space_creations (nonce, space_id, device_id, token_hash, epoch, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            creation.nonce.as_slice(),
            creation.space_id,
            creation.device_id,
            creation.hash,
            creation.epoch,
            creation.now + REPLAY_WINDOW_MS
        ],
    ) {
        return raced(error);
    }
    tx.commit()?;
    Ok(Some(enrollment(creation.space_id, creation.device_id, creation.epoch)))
}

fn raced(error: rusqlite::Error) -> Result<Option<Enrollment>, ApiError> {
    if is_constraint(&error) {
        Ok(None)
    } else {
        Err(error.into())
    }
}

fn enrollment(space: Uuid, device: Uuid, epoch: Uuid) -> Enrollment {
    Enrollment {
        space_id: space.into_bytes(),
        device_id: device.into_bytes(),
        epoch: epoch.into_bytes(),
    }
}

/// The creation this nonce already recorded, when `hash` is that device's token hash.
fn same_creation(conn: &Connection, nonce: &[u8; 16], hash: &[u8]) -> Result<Option<Enrollment>, ApiError> {
    let row = conn
        .query_row(
            "SELECT space_id, device_id, token_hash, epoch FROM space_creations WHERE nonce = ?1",
            params![nonce.as_slice()],
            |row| {
                Ok((
                    row.get::<_, Uuid>(0)?,
                    row.get::<_, Uuid>(1)?,
                    row.get::<_, Vec<u8>>(2)?,
                    row.get::<_, Uuid>(3)?,
                ))
            },
        )
        .optional()?;
    match row {
        Some((space, device, stored, epoch)) if stored == hash => Ok(Some(enrollment(space, device, epoch))),
        Some(_) => Err(ApiError::bad_request("the nonce was used with another token")),
        None => Ok(None),
    }
}

impl Server {
    /// Every space, as `GET /v1/spaces` lists them; `koloda-server spaces` prints it.
    pub fn spaces(&self) -> Result<SpaceList, ApiError> {
        list_spaces(self)
    }
}

fn list_spaces(server: &Server) -> Result<SpaceList, ApiError> {
    let conn = server.server_db()?;
    let mut statement = conn.prepare(
        "SELECT s.id, s.name, s.created_at, count(d.id)
         FROM spaces s LEFT JOIN devices d ON d.space_id = s.id AND d.revoked_at IS NULL
         GROUP BY s.id ORDER BY s.created_at, s.id",
    )?;
    let spaces = statement
        .query_map([], |row| {
            Ok(SpaceSummary {
                id: row.get::<_, Uuid>(0)?.into_bytes(),
                name: row.get(1)?,
                created_at: row.get(2)?,
                device_count: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(SpaceList { spaces })
}

pub(crate) fn checked_name<'a>(what: &str, name: &'a str) -> Result<&'a str, ApiError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME_CHARS {
        return Err(ApiError::bad_request(format!(
            "{what} must have 1 to {MAX_NAME_CHARS} characters"
        )));
    }
    Ok(name)
}
