//! Calls to the sync server: CBOR bodies with zstd, the `{ meta, ok | error }` reply, the skew estimate, and retries
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Transport).

use std::borrow::Cow;
use std::io::Read;
use std::sync::atomic::{AtomicI64, Ordering};

use koloda::app::error::{error_codes, AppError};
use koloda::app::utility::get_current_timestamp;
use koloda_sync_proto::transport::{Meta, Reply, MAX_BODY_BYTES, MAX_EXPANSION_RATIO};
use serde::de::DeserializeOwned;
use serde::Serialize;
use url::{Host, Url};

use crate::error::SyncError;
use crate::transport::{Method, Request, Response, Transport, TransportError};

/// Retries after the first attempt when no complete reply arrives.
const MAX_RETRIES: usize = 3;

const ZSTD_ABOVE_BYTES: usize = 1024;
const ZSTD_LEVEL: i32 = 3;
const OK: u16 = 200;

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

/// A successful reply: its `ok` body and its `meta`.
pub(crate) struct Answer<T> {
    pub(crate) ok: T,
    pub(crate) meta: Meta,
}

pub(crate) struct Client<'a> {
    pub(crate) base: &'a str,
    pub(crate) transport: &'a dyn Transport,
    pub(crate) skew: &'a Skew,
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
        let (body, is_zstd) = match body {
            Some(body) => {
                let (bytes, is_zstd) = encode(body)?;
                (Some(bytes), is_zstd)
            }
            None => (None, false),
        };
        let request = Request {
            method,
            url: format!("{}{path}", self.base),
            token: token.map(str::to_string),
            body,
            is_zstd,
        };

        let mut lost = TransportError(String::new());
        for _ in 0..=MAX_RETRIES {
            match self.transport.send(request.clone()).await {
                Ok(response) => match self.read(&response) {
                    Ok(answer) => return answer,
                    Err(error) => lost = error,
                },
                Err(error) => lost = error,
            }
        }
        Err(SyncError::Transport(lost.0))
    }

    fn read<T: DeserializeOwned>(&self, response: &Response) -> Result<Result<Answer<T>, SyncError>, TransportError> {
        let reply: Reply<T> = decode(response)?;
        self.skew
            .record(reply.meta.server_time_ms)
            .map_err(|error| TransportError(error.to_string()))?;
        match (reply.ok, reply.error) {
            (Some(ok), None) if response.status == OK => Ok(Ok(Answer { ok, meta: reply.meta })),
            (None, Some(error)) if response.status != OK => Ok(Err(SyncError::Server {
                status: response.status,
                code: error.code,
                message: error.message,
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
    Ok((compressed, true))
}

fn decode<T: DeserializeOwned>(response: &Response) -> Result<Reply<T>, TransportError> {
    let bytes = if response.is_zstd {
        Cow::Owned(decompress(&response.body)?)
    } else {
        Cow::Borrowed(response.body.as_slice())
    };
    let mut rest = bytes.as_ref();
    let reply = ciborium::from_reader(&mut rest)
        .map_err(|error| TransportError(format!("a {} reply is not a sync reply: {error}", response.status)))?;
    if !rest.is_empty() {
        return Err(TransportError(format!(
            "a {} reply has {} bytes after its body",
            response.status,
            rest.len()
        )));
    }
    Ok(reply)
}

fn decompress(encoded: &[u8]) -> Result<Vec<u8>, TransportError> {
    let cap = MAX_BODY_BYTES.min(encoded.len().saturating_mul(MAX_EXPANSION_RATIO));
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
