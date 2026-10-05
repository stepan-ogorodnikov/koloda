//! The join probe: which of a joining file's ids the space holds live or fenced (`PROTOCOL.md` §Joining).

use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::Response;
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::{Known, KnownId, KnownIds, MAX_KNOWN_IDS};

use crate::auth;
use crate::http::{read_body, respond, ApiError};
use crate::log;
use crate::server::{lock, Server};

pub(crate) async fn known(
    State(server): State<Arc<Server>>,
    Path(space): Path<String>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let request = read_body::<KnownIds>(&headers, body).await;
    respond(server, headers, move |server, scope, headers| {
        let caller = auth::require_device(server, scope, headers, &space)?;
        let request = request?;
        if request.ids.len() > MAX_KNOWN_IDS {
            return Err(ApiError::too_large(format!(
                "a probe chunk carries at most {MAX_KNOWN_IDS} ids"
            )));
        }
        let space = server.space(caller.space)?.ok_or_else(ApiError::unknown_space)?;
        let conn = lock(&space.reader)?;
        let mut ids = Vec::new();
        for asked in request.ids {
            let kind = Kind::from_wire(&asked.kind).map_err(|error| ApiError::bad_request(error.to_string()))?;
            if let Some(state) = log::known(&conn, kind, &asked.id)? {
                ids.push(KnownId {
                    kind: asked.kind,
                    id: asked.id,
                    state,
                });
            }
        }
        Ok(Known { ids })
    })
    .await
}
