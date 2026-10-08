//! CBOR bodies with optional zstd, the `{ meta, ok | error }` reply, and the bridge from async handlers to SQLite.
//!
//! Handlers read their body first, then hand their work to `respond`, which runs it on the blocking pool and builds
//! `meta` from what the work put in its `Scope`, so failures carry the same metadata as successes.

use std::collections::BTreeMap;
use std::fmt;
use std::io::Read;
use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::extract::rejection::QueryRejection;
use axum::extract::Query;
use axum::http::header::{ACCEPT_ENCODING, CONTENT_ENCODING, CONTENT_TYPE};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use koloda_sync_proto::transport::{
    DeviceMeta, ErrorBody, ErrorCode, Meta, Reply, Restore, MAX_BODY_BYTES, MAX_EXPANSION_RATIO,
};
use rusqlite::OptionalExtension;
use serde::de::DeserializeOwned;
use serde::Serialize;
use uuid::Uuid;

use crate::log;
use crate::quota::Room;
use crate::server::{lock, Server};

const CBOR: &str = "application/cbor";
const ZSTD: &str = "zstd";
const ZSTD_LEVEL: i32 = 3;

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: ErrorCode,
    message: String,
    restore: Option<Restore>,
}

/// What a request revealed about its caller, for `meta`: the space whose epoch it may learn, and the authenticated
/// device, if any.
#[derive(Default)]
pub(crate) struct Scope {
    pub(crate) space: Option<Uuid>,
    pub(crate) device: Option<Uuid>,
}

impl ApiError {
    pub(crate) fn new(status: StatusCode, code: ErrorCode, message: impl Into<String>) -> ApiError {
        ApiError {
            status,
            code,
            message: message.into(),
            restore: None,
        }
    }

    /// The caller's epoch is not the space's: it must apply `restore` before anything else (`PROTOCOL.md` §Server
    /// restore).
    pub(crate) fn epoch_changed(restore: Restore) -> ApiError {
        ApiError {
            restore: Some(restore),
            ..ApiError::new(
                StatusCode::CONFLICT,
                ErrorCode::EpochChanged,
                "this space was restored since this device last synced",
            )
        }
    }

    pub(crate) fn bad_request(message: impl Into<String>) -> ApiError {
        ApiError::new(StatusCode::BAD_REQUEST, ErrorCode::BadRequest, message)
    }

    pub(crate) fn too_large(message: impl Into<String>) -> ApiError {
        ApiError::new(StatusCode::PAYLOAD_TOO_LARGE, ErrorCode::TooLarge, message)
    }

    pub(crate) fn not_found(message: impl Into<String>) -> ApiError {
        ApiError::new(StatusCode::NOT_FOUND, ErrorCode::NotFound, message)
    }

    pub(crate) fn cursor_too_old(message: impl Into<String>) -> ApiError {
        ApiError::new(StatusCode::CONFLICT, ErrorCode::CursorTooOld, message)
    }

    pub(crate) fn unknown_space() -> ApiError {
        ApiError::new(StatusCode::NOT_FOUND, ErrorCode::UnknownSpace, "no such space")
    }

    pub(crate) fn internal(message: impl Into<String>) -> ApiError {
        ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, ErrorCode::Internal, message)
    }

    pub fn code(&self) -> ErrorCode {
        self.code
    }

    fn body(&self) -> ErrorBody {
        ErrorBody {
            code: self.code,
            message: self.message.clone(),
            restore: self.restore.clone(),
        }
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.code, self.message)
    }
}

impl From<rusqlite::Error> for ApiError {
    fn from(error: rusqlite::Error) -> Self {
        ApiError::internal(format!("sqlite: {error}"))
    }
}

pub(crate) async fn read_body<T: DeserializeOwned>(headers: &HeaderMap, body: Body) -> Result<T, ApiError> {
    let bytes = to_bytes(body, MAX_BODY_BYTES)
        .await
        .map_err(|error| ApiError::too_large(format!("body is over {MAX_BODY_BYTES} bytes: {error}")))?;
    let decoded = match headers.get(CONTENT_ENCODING) {
        None => bytes.to_vec(),
        Some(encoding) if encoding == ZSTD => decompress(&bytes)?,
        Some(encoding) => {
            return Err(ApiError::bad_request(format!(
                "unsupported content encoding {encoding:?}"
            )))
        }
    };
    decode_cbor(&decoded)
}

fn decompress(encoded: &[u8]) -> Result<Vec<u8>, ApiError> {
    let cap = MAX_BODY_BYTES.min(encoded.len().saturating_mul(MAX_EXPANSION_RATIO));
    let decoder =
        zstd::stream::read::Decoder::new(encoded).map_err(|error| ApiError::bad_request(format!("zstd: {error}")))?;
    let mut decoded = Vec::new();
    decoder
        .take(u64::try_from(cap).unwrap_or(u64::MAX).saturating_add(1))
        .read_to_end(&mut decoded)
        .map_err(|error| ApiError::bad_request(format!("zstd: {error}")))?;
    if decoded.len() > cap {
        return Err(ApiError::too_large(format!(
            "zstd body expands past {cap} bytes ({MAX_EXPANSION_RATIO} times its size, at most {MAX_BODY_BYTES})"
        )));
    }
    Ok(decoded)
}

pub(crate) fn query<T>(params: Result<Query<T>, QueryRejection>) -> Result<T, ApiError> {
    params
        .map(|Query(params)| params)
        .map_err(|rejection| ApiError::bad_request(rejection.body_text()))
}

fn decode_cbor<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, ApiError> {
    let mut rest = bytes;
    let value = ciborium::from_reader(&mut rest).map_err(|error| ApiError::bad_request(format!("cbor: {error}")))?;
    if !rest.is_empty() {
        return Err(ApiError::bad_request(format!(
            "cbor: {} bytes after the body",
            rest.len()
        )));
    }
    Ok(value)
}

pub(crate) async fn respond<T, F>(server: Arc<Server>, headers: HeaderMap, work: F) -> Response
where
    T: Serialize + Send + 'static,
    F: FnOnce(&Server, &mut Scope, &HeaderMap) -> Result<T, ApiError> + Send + 'static,
{
    let compress = headers
        .get(ACCEPT_ENCODING)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.split(',').any(|coding| coding.trim().starts_with(ZSTD)));
    let encoded = tokio::task::spawn_blocking(move || {
        let mut scope = Scope::default();
        let result = work(&server, &mut scope, &headers);
        let meta = meta(&server, &scope);
        encode_reply(meta, result)
    })
    .await;
    match encoded {
        Ok(Ok((status, bytes))) => cbor_response(status, bytes, compress),
        Ok(Err(error)) => (StatusCode::INTERNAL_SERVER_ERROR, error.message).into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

pub(crate) async fn fallback(axum::extract::State(server): axum::extract::State<Arc<Server>>) -> Response {
    respond(server, HeaderMap::new(), |_, _, _| {
        Err::<(), _>(ApiError::not_found("no such endpoint"))
    })
    .await
}

fn encode_reply<T: Serialize>(
    meta: Result<Meta, ApiError>,
    result: Result<T, ApiError>,
) -> Result<(StatusCode, Vec<u8>), ApiError> {
    let meta = meta?;
    let (status, reply) = match result {
        Ok(ok) => (
            StatusCode::OK,
            Reply {
                meta,
                ok: Some(ok),
                error: None,
            },
        ),
        Err(error) => (
            error.status,
            Reply {
                meta,
                ok: None,
                error: Some(error.body()),
            },
        ),
    };
    let mut bytes = Vec::new();
    ciborium::into_writer(&reply, &mut bytes).map_err(|error| ApiError::internal(format!("cbor: {error}")))?;
    Ok((status, bytes))
}

fn cbor_response(status: StatusCode, bytes: Vec<u8>, compress: bool) -> Response {
    let mut response = if compress {
        match zstd::encode_all(bytes.as_slice(), ZSTD_LEVEL) {
            Ok(compressed) => {
                let mut response = (status, compressed).into_response();
                response
                    .headers_mut()
                    .insert(CONTENT_ENCODING, HeaderValue::from_static(ZSTD));
                response
            }
            Err(error) => return (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
        }
    } else {
        (status, bytes).into_response()
    };
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static(CBOR));
    response
}

fn meta(server: &Server, scope: &Scope) -> Result<Meta, ApiError> {
    let mut meta = Meta {
        server_time_ms: server.now_ms(),
        epoch: None,
        device: None,
    };
    let Some(space_id) = scope.space else {
        return Ok(meta);
    };
    let Some(space) = server.space(space_id)? else {
        return Ok(meta);
    };
    let quota = match scope.device {
        Some(_) => server.quota(space_id)?,
        None => None,
    };
    let conn = lock(&space.reader)?;
    let epoch: Option<Uuid> = conn
        .query_row("SELECT epoch FROM space WHERE id = 1", [], |row| row.get(0))
        .optional()?;
    meta.epoch = epoch.map(Uuid::into_bytes);
    if let Some(device) = scope.device {
        let mut statement = conn.prepare("SELECT kind, schema FROM write_schema ORDER BY kind")?;
        let write_schema = statement
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?)))?
            .collect::<Result<BTreeMap<_, _>, _>>()?;
        let (head_hot, head_cold) = log::lane_heads(&conn)?;
        let (gc_horizon_hot, gc_horizon_cold) = log::gc_horizons(&conn)?;
        meta.device = Some(DeviceMeta {
            head_hot,
            head_cold,
            gc_horizon_hot,
            gc_horizon_cold,
            write_schema,
            last_sender_seq: log::sender_progress(&conn, device)?.map_or(0, |(seq, _)| seq),
            is_over_quota: server.room(&conn, quota)? != Room::Free,
        });
    }
    Ok(meta)
}
