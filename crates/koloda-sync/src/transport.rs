//! One HTTP request to the sync server and its raw reply. The client (`client.rs`) owns CBOR, zstd, and retries, so
//! tests can stand in for the network with the server's router.

use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

use koloda_sync_proto::transport::MAX_BODY_BYTES;
use reqwest::header::{ACCEPT_ENCODING, CONTENT_ENCODING, CONTENT_TYPE};

use crate::error::SyncError;

pub const CBOR: &str = "application/cbor";
pub const ZSTD: &str = "zstd";

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
    Delete,
}

/// `url` is the server URL joined with the endpoint path and its query.
#[derive(Clone, Debug)]
pub struct Request {
    pub method: Method,
    pub url: String,
    pub token: Option<String>,
    pub body: Option<Vec<u8>>,
    pub is_zstd: bool,
}

#[derive(Clone, Debug)]
pub struct Response {
    pub status: u16,
    pub body: Vec<u8>,
    pub is_zstd: bool,
}

/// No complete reply arrived. The request may or may not have reached the server.
#[derive(Clone, Debug)]
pub struct TransportError(pub String);

pub type Sending<'a> = Pin<Box<dyn Future<Output = Result<Response, TransportError>> + Send + 'a>>;

/// Sends one request and returns the reply as the server sent it.
/// Implementations ask for zstd replies and read at most `MAX_BODY_BYTES` of body.
pub trait Transport: Send + Sync {
    fn send(&self, request: Request) -> Sending<'_>;
}

pub struct HttpTransport {
    client: reqwest::Client,
}

impl HttpTransport {
    pub fn new() -> Result<HttpTransport, SyncError> {
        let client = reqwest::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|error| SyncError::Transport(error.to_string()))?;
        Ok(HttpTransport { client })
    }
}

impl Transport for HttpTransport {
    fn send(&self, request: Request) -> Sending<'_> {
        Box::pin(async move {
            let method = match request.method {
                Method::Get => reqwest::Method::GET,
                Method::Post => reqwest::Method::POST,
                Method::Delete => reqwest::Method::DELETE,
            };
            let mut builder = self.client.request(method, &request.url).header(ACCEPT_ENCODING, ZSTD);
            if let Some(token) = &request.token {
                builder = builder.bearer_auth(token);
            }
            if let Some(body) = request.body {
                builder = builder.header(CONTENT_TYPE, CBOR).body(body);
                if request.is_zstd {
                    builder = builder.header(CONTENT_ENCODING, ZSTD);
                }
            }

            let mut response = builder.send().await.map_err(transport_error)?;
            let status = response.status().as_u16();
            let is_zstd = response
                .headers()
                .get(CONTENT_ENCODING)
                .is_some_and(|encoding| encoding == ZSTD);
            let mut body = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(transport_error)? {
                if body.len() + chunk.len() > MAX_BODY_BYTES {
                    return Err(TransportError(format!("reply body is over {MAX_BODY_BYTES} bytes")));
                }
                body.extend_from_slice(&chunk);
            }
            Ok(Response { status, body, is_zstd })
        })
    }
}

// WHY: reqwest's message names the URL, never the bearer token or the body, so it is safe to report.
fn transport_error(error: reqwest::Error) -> TransportError {
    TransportError(error.to_string())
}
