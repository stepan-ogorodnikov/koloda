//! Spaces: creation, which enrolls the creator, and the list. Both need the setup token.

use std::sync::Arc;

use axum::body::Body;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::Response;
use koloda_sync_proto::transport::{CreateSpace, Enrollment, SpaceList, SpaceSummary, MAX_NAME_CHARS};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use crate::auth;
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
    let now = server.now_ms();
    let mut conn = server.server_db()?;
    conn.execute("DELETE FROM space_creations WHERE expires_at < ?1", params![now])?;
    let replay = conn
        .query_row(
            "SELECT space_id, device_id, token, epoch FROM space_creations WHERE nonce = ?1",
            params![request.nonce.to_vec()],
            |row| {
                Ok(Enrollment {
                    space_id: row.get::<_, Uuid>(0)?.into_bytes(),
                    device_id: row.get::<_, Uuid>(1)?.into_bytes(),
                    token: row.get(2)?,
                    epoch: row.get::<_, Uuid>(3)?.into_bytes(),
                })
            },
        )
        .optional()?;
    if let Some(enrollment) = replay {
        return Ok(enrollment);
    }

    let space_id = Uuid::new_v4();
    let epoch = Uuid::new_v4();
    let device_id = Uuid::new_v4();
    let token = auth::new_token().map_err(|error| ApiError::internal(error.to_string()))?;
    // INVARIANT: the space database exists before `server.db` names it, so a crash in between leaves an unreachable
    // file and never a space row without its log.
    server.create_space_db(space_id, epoch, now)?;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO spaces (id, name, created_at) VALUES (?1, ?2, ?3)",
        params![space_id, name, now],
    )?;
    tx.execute(
        "INSERT INTO devices (id, space_id, token_hash, name, platform, created_at, last_seen)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            device_id,
            space_id,
            auth::token_hash(&token).to_vec(),
            device_name,
            request.platform.as_wire(),
            now
        ],
    )?;
    tx.execute(
        "INSERT INTO space_creations (nonce, space_id, device_id, token, epoch, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            request.nonce.to_vec(),
            space_id,
            device_id,
            token,
            epoch,
            now + REPLAY_WINDOW_MS
        ],
    )?;
    tx.commit()?;
    Ok(Enrollment {
        space_id: space_id.into_bytes(),
        device_id: device_id.into_bytes(),
        token,
        epoch: epoch.into_bytes(),
    })
}

fn list_spaces(server: &Server) -> Result<SpaceList, ApiError> {
    let conn = server.server_db()?;
    let mut statement = conn.prepare(
        "SELECT s.id, s.name, s.created_at, count(d.id)
         FROM spaces s LEFT JOIN devices d ON d.space_id = s.id
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
