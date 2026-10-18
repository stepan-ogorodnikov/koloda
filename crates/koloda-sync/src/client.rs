//! Calls to the sync server: CBOR bodies with zstd, the `{ meta, ok | error }` reply, the skew estimate, and retries
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Transport).

use std::borrow::Cow;
use std::io::Read;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;

use koloda::app::error::{error_codes, AppError};
use koloda::app::utility::get_current_timestamp;
use koloda_sync_proto::payload::SCHEMA;
use koloda_sync_proto::transport::{encode_schemas, ErrorCode, Meta, Reply, MAX_BODY_BYTES, MAX_EXPANSION_RATIO};
use serde::de::DeserializeOwned;
use serde::Serialize;
use url::{Host, Url};
use uuid::Uuid;

use crate::error::SyncError;
use crate::runner::Spending;
use crate::transport::{Method, Request, Response, Transport, TransportError};

/// Retries after the first attempt when no complete reply arrives.
const MAX_RETRIES: usize = 3;

const ZSTD_ABOVE_BYTES: usize = 1024;
const ZSTD_LEVEL: i32 = 3;
pub(crate) const OK: u16 = 200;

/// Server time minus local time when the last reply arrived, in milliseconds.
#[derive(Default)]
pub(crate) struct Skew(AtomicI64);

impl Skew {
    pub(crate) fn get(&self) -> i64 {
        self.0.load(Ordering::SeqCst)
    }

    fn record(&self, server_time_ms: u64) -> Result<(), SyncError> {
        let server = i64::try_from(server_time_ms).map_err(local_error)?;
        self.0.store(server - get_current_timestamp()?, Ordering::SeqCst);
        Ok(())
    }
}

/// A successful reply: its `ok` body, its `meta`, and its body's size on the wire.
pub(crate) struct Answer<T> {
    pub(crate) ok: T,
    pub(crate) meta: Meta,
    pub(crate) bytes: usize,
}

pub(crate) struct Client<'a> {
    pub(crate) base: &'a str,
    pub(crate) transport: &'a dyn Transport,
    pub(crate) skew: &'a Skew,
    pub(crate) spending: Option<&'a Mutex<Option<Spending>>>,
    /// The session's epoch for device calls, which also advertise this app's schemas; `None` for calls made with a
    /// pairing code or the setup token.
    pub(crate) epoch: Option<Uuid>,
}

impl Client<'_> {
    /// Sends one request, retrying with the same bytes while no complete reply arrives.
    pub(crate) async fn call<B: Serialize, T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        token: Option<&str>,
        body: Option<&B>,
    ) -> Result<Answer<T>, SyncError> {
        // INVARIANT: a tick's budget is checked before every request, so a spent tick sends nothing more.
        if let Some(spending) = self.spending {
            if let Some(spending) = spending
                .lock()
                .map_err(|error| local_error(error.to_string()))?
                .as_ref()
            {
                spending.check()?;
            }
        }
        let (body, is_zstd) = match body {
            Some(body) => {
                let (bytes, is_zstd) = encode(body)?;
                (Some(bytes), is_zstd)
            }
            None => (None, false),
        };
        let request = Request {
            body,
            is_zstd,
            ..self.request(method, path, token)
        };

        let mut lost = (None, String::new());
        for _ in 0..=MAX_RETRIES {
            match self.transport.send(request.clone()).await {
                Ok(response) => match self.read(&response) {
                    Ok(answer) => return answer,
                    Err(TransportError(message)) => lost = (Some(response.status), message),
                },
                Err(TransportError(message)) => lost = (None, message),
            }
        }
        let (status, message) = lost;
        Err(SyncError::Transport { status, message })
    }

    /// A request with no body, as `call` sends it before adding one.
    pub(crate) fn request(&self, method: Method, path: &str, token: Option<&str>) -> Request {
        Request {
            method,
            url: format!("{}{path}", self.base),
            token: token.map(str::to_string),
            epoch: self.epoch,
            schemas: self.epoch.map(|_| encode_schemas(|_| SCHEMA)),
            body: None,
            is_zstd: false,
        }
    }

    fn read<T: DeserializeOwned>(&self, response: &Response) -> Result<Result<Answer<T>, SyncError>, TransportError> {
        let reply: Reply<T> = match decode(response)? {
            Decoded::Reply(reply) => reply,
            // WHY: not retried, since the server sends the same reply again until this app is updated.
            Decoded::Unreadable(message) => {
                return Ok(Err(SyncError::UpdateRequired {
                    status: response.status,
                    message,
                }))
            }
        };
        self.skew
            .record(reply.meta.server_time_ms)
            .map_err(|error| TransportError(error.to_string()))?;
        match (reply.ok, reply.error) {
            (Some(ok), None) if response.status == OK => Ok(Ok(Answer {
                ok,
                meta: reply.meta,
                bytes: response.body.len(),
            })),
            (None, Some(error)) if response.status != OK => Ok(Err(match (error.code, error.restore) {
                (ErrorCode::EpochChanged, Some(restore)) => SyncError::Restored {
                    restore,
                    last_sender_seq: reply.meta.device.map_or(0, |device| device.last_sender_seq),
                },
                // WHY: a restore that predates this device, or rotated every token, answers `401` with an epoch the
                // device never saw; that is a new pairing, not a revocation (PROTOCOL.md, Server restore).
                (ErrorCode::Revoked | ErrorCode::UnknownDevice, _)
                    if self
                        .epoch
                        .zip(reply.meta.epoch)
                        .is_some_and(|(sent, answered)| *sent.as_bytes() != answered) =>
                {
                    SyncError::PairAgain
                }
                (code, _) => SyncError::Server {
                    status: response.status,
                    code,
                    message: error.message,
                },
            })),
            _ => Err(TransportError(format!(
                "a {} reply carries neither one `ok` nor one `error`",
                response.status
            ))),
        }
    }
}

/// The server URL as requests use it, without a trailing slash.
///
/// WHY: tokens and pairing codes travel in every request, so plain HTTP is allowed only to this machine.
pub(crate) fn server_url(raw: &str) -> Result<String, SyncError> {
    let refused = || SyncError::InsecureServerUrl(raw.to_string());
    let url = Url::parse(raw.trim()).map_err(|_unparsed| refused())?;
    let is_loopback = match url.host() {
        Some(Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(address)) => address.is_loopback(),
        Some(Host::Ipv6(address)) => address.is_loopback(),
        None => return Err(refused()),
    };
    let is_allowed = match url.scheme() {
        "https" => true,
        "http" => is_loopback,
        _ => false,
    };
    if !is_allowed || url.query().is_some() || url.fragment().is_some() {
        return Err(refused());
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}

fn encode<B: Serialize>(body: &B) -> Result<(Vec<u8>, bool), SyncError> {
    let mut bytes = Vec::new();
    ciborium::into_writer(body, &mut bytes).map_err(local_error)?;
    if bytes.len() <= ZSTD_ABOVE_BYTES {
        return Ok((bytes, false));
    }
    let compressed = zstd::encode_all(bytes.as_slice(), ZSTD_LEVEL).map_err(local_error)?;
    // WHY: the server refuses a request body that expands past the ratio, and refuses it again on every retry. A
    // body that repetitive, or one zstd cannot shrink, goes out as it is; the size cap still bounds it.
    if compressed.len() >= bytes.len() || bytes.len() > compressed.len().saturating_mul(MAX_EXPANSION_RATIO) {
        return Ok((bytes, false));
    }
    Ok((compressed, true))
}

enum Decoded<T> {
    Reply(Reply<T>),
    /// A sync reply whose body this app cannot read, and why.
    Unreadable(String),
}

fn decode<T: DeserializeOwned>(response: &Response) -> Result<Decoded<T>, TransportError> {
    let bytes = if response.is_zstd {
        Cow::Owned(decompress(&response.body)?)
    } else {
        Cow::Borrowed(response.body.as_slice())
    };
    let mut rest = bytes.as_ref();
    let reply = match ciborium::from_reader(&mut rest) {
        Ok(reply) => reply,
        // INVARIANT: every body refuses keys and values this app lacks (PROTOCOL.md, Bodies), so a CBOR map with a
        // `meta` key that does not decode comes from a newer server. Anything else, such as a proxy's error page, is
        // not a sync reply.
        Err(error) if is_sync_reply(&bytes) => return Ok(Decoded::Unreadable(error.to_string())),
        Err(error) => {
            return Err(TransportError(format!(
                "a {} reply is not a sync reply: {error}",
                response.status
            )))
        }
    };
    if !rest.is_empty() {
        return Err(TransportError(format!(
            "a {} reply has {} bytes after its body",
            response.status,
            rest.len()
        )));
    }
    Ok(Decoded::Reply(reply))
}

fn is_sync_reply(bytes: &[u8]) -> bool {
    ciborium::from_reader::<ciborium::Value, _>(bytes)
        .ok()
        .and_then(|value| value.into_map().ok())
        .is_some_and(|entries| entries.iter().any(|(key, _)| key.as_text() == Some("meta")))
}

// WHY: only the size cap applies to a reply. The expansion ratio guards the server against request bombs, and a push
// reply's repeated outcomes compress far past it.
fn decompress(encoded: &[u8]) -> Result<Vec<u8>, TransportError> {
    let cap = MAX_BODY_BYTES;
    let decoder =
        zstd::stream::read::Decoder::new(encoded).map_err(|error| TransportError(format!("zstd: {error}")))?;
    let mut decoded = Vec::new();
    decoder
        .take(u64::try_from(cap).unwrap_or(u64::MAX).saturating_add(1))
        .read_to_end(&mut decoded)
        .map_err(|error| TransportError(format!("zstd: {error}")))?;
    if decoded.len() > cap {
        return Err(TransportError(format!("the reply expands past {cap} bytes")));
    }
    Ok(decoded)
}

pub(crate) fn local_error(error: impl std::fmt::Display) -> SyncError {
    SyncError::Local(AppError::new(error_codes::UNKNOWN, Some(error.to_string())))
}

/// 32 random bytes as 64 lowercase hex characters, the enrollment token format (`PROTOCOL.md` §Devices).
pub(crate) fn mint_token() -> Result<String, SyncError> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(local_error)?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}
