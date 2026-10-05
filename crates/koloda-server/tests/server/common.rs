//! In-process harness: a fresh data directory, a manual clock, and the router called without sockets.

use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::extract::ConnectInfo;
use axum::http::header::{ACCEPT_ENCODING, AUTHORIZATION, CONTENT_ENCODING};
use axum::http::{Method, Request, StatusCode};
use axum::Router;
use koloda_server::clock::Clock;
use koloda_server::data_dir;
use koloda_server::router;
use koloda_server::server::Server;
use koloda_sync_proto::transport::{
    ClaimPairing, CreateSpace, Enrollment, ErrorCode, IssuePairing, Pairing, PairingClaim, Platform, Reply,
};
use serde::de::DeserializeOwned;
use serde::Serialize;
use tempfile::TempDir;

pub const START_MS: u64 = 1_727_000_000_000;

pub struct ManualClock(AtomicU64);

impl Clock for ManualClock {
    fn now_ms(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }
}

impl ManualClock {
    pub fn advance(&self, ms: u64) {
        self.0.fetch_add(ms, Ordering::SeqCst);
    }
}

pub struct Harness {
    // WHY: dropping the TempDir deletes the data directory, so the harness holds it for its lifetime.
    _dir: TempDir,
    pub clock: Arc<ManualClock>,
    pub router: Router,
    pub setup_token: String,
}

pub struct Call<'a> {
    harness: &'a Harness,
    method: Method,
    path: String,
    token: Option<String>,
    body: Option<Vec<u8>>,
    content_encoding: Option<&'static str>,
    accept_zstd: bool,
    peer: Option<SocketAddr>,
}

pub struct Answer<T> {
    pub status: StatusCode,
    pub reply: Reply<T>,
    pub content_encoding: Option<String>,
}

impl Harness {
    pub fn new() -> Harness {
        let dir = tempfile::tempdir().expect("temporary data directory");
        let setup_token = data_dir::init(dir.path(), START_MS).expect("init a fresh data directory");
        let clock = Arc::new(ManualClock(AtomicU64::new(START_MS)));
        let server = Server::open(dir.path(), clock.clone()).expect("open the initialized data directory");
        Harness {
            router: router(Arc::new(server)),
            _dir: dir,
            clock,
            setup_token,
        }
    }

    pub fn call(&self, method: Method, path: impl Into<String>) -> Call<'_> {
        Call {
            harness: self,
            method,
            path: path.into(),
            token: None,
            body: None,
            content_encoding: None,
            accept_zstd: false,
            peer: None,
        }
    }

    pub fn get(&self, path: impl Into<String>) -> Call<'_> {
        self.call(Method::GET, path)
    }

    pub fn post(&self, path: impl Into<String>) -> Call<'_> {
        self.call(Method::POST, path)
    }

    pub async fn create_space(&self, name: &str) -> Enrollment {
        self.post("/v1/spaces")
            .token(&self.setup_token)
            .body(&create_request(name, nonce(name)))
            .send::<Enrollment>()
            .await
            .ok()
    }

    /// Enrolls a second device into `space` through a pairing code its creator issues.
    pub async fn pair(&self, space: &Enrollment, name: &str) -> Enrollment {
        let pairing = self
            .post(format!("/v1/spaces/{}/pairings", uuid(space.space_id)))
            .token(&space.token)
            .body(&IssuePairing::default())
            .send::<Pairing>()
            .await
            .ok();
        self.post("/v1/pairings/claim")
            .body(&claim_request(&pairing.code, name, nonce(name)))
            .send::<PairingClaim>()
            .await
            .ok()
            .enrollment
    }
}

impl Call<'_> {
    pub fn token(mut self, token: &str) -> Self {
        self.token = Some(token.to_string());
        self
    }

    pub fn body<B: Serialize>(mut self, body: &B) -> Self {
        let mut bytes = Vec::new();
        ciborium::into_writer(body, &mut bytes).expect("encode a test body");
        self.body = Some(bytes);
        self
    }

    pub fn raw(mut self, bytes: Vec<u8>, content_encoding: Option<&'static str>) -> Self {
        self.body = Some(bytes);
        self.content_encoding = content_encoding;
        self
    }

    pub fn accept_zstd(mut self) -> Self {
        self.accept_zstd = true;
        self
    }

    /// The client address `serve` would record for the connection.
    pub fn peer(mut self, peer: SocketAddr) -> Self {
        self.peer = Some(peer);
        self
    }

    pub async fn send<T: DeserializeOwned>(self) -> Answer<T> {
        let mut request = Request::builder().method(self.method).uri(self.path);
        if let Some(token) = &self.token {
            request = request.header(AUTHORIZATION, format!("Bearer {token}"));
        }
        if let Some(encoding) = self.content_encoding {
            request = request.header(CONTENT_ENCODING, encoding);
        }
        if self.accept_zstd {
            request = request.header(ACCEPT_ENCODING, "zstd");
        }
        let mut request = request
            .body(self.body.map_or_else(Body::empty, Body::from))
            .expect("build a test request");
        if let Some(peer) = self.peer {
            request.extensions_mut().insert(ConnectInfo(peer));
        }
        let response = tower::ServiceExt::oneshot(self.harness.router.clone(), request)
            .await
            .expect("the router never fails");
        let status = response.status();
        let content_encoding = response
            .headers()
            .get(CONTENT_ENCODING)
            .map(|value| value.to_str().expect("ascii content encoding").to_string());
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("read the response body");
        let bytes = match content_encoding.as_deref() {
            Some("zstd") => zstd::decode_all(bytes.as_ref()).expect("decode a zstd reply"),
            _ => bytes.to_vec(),
        };
        let reply = ciborium::from_reader(bytes.as_slice()).expect("every response is a CBOR reply");
        Answer {
            status,
            reply,
            content_encoding,
        }
    }
}

impl<T> Answer<T> {
    pub fn ok(self) -> T {
        assert_eq!(self.status, StatusCode::OK, "error reply: {:?}", self.reply.error);
        self.reply.ok.expect("a 200 reply carries `ok`")
    }

    pub fn error(&self) -> (StatusCode, ErrorCode) {
        let error = self.reply.error.as_ref().expect("an error reply carries `error`");
        assert!(self.reply.ok.is_none(), "an error reply carries no `ok`");
        (self.status, error.code)
    }
}

pub fn create_request(name: &str, nonce: [u8; 16]) -> CreateSpace {
    CreateSpace {
        name: name.to_string(),
        device_name: format!("{name} laptop"),
        platform: Platform::DesktopLinux,
        nonce,
    }
}

pub fn claim_request(code: &str, name: &str, nonce: [u8; 16]) -> ClaimPairing {
    ClaimPairing {
        code: code.to_string(),
        name: name.to_string(),
        platform: Platform::DesktopMac,
        nonce,
    }
}

pub fn nonce(seed: &str) -> [u8; 16] {
    let mut nonce = [0; 16];
    for (slot, byte) in nonce.iter_mut().zip(seed.bytes()) {
        *slot = byte;
    }
    nonce
}

pub fn uuid(bytes: [u8; 16]) -> String {
    uuid::Uuid::from_bytes(bytes).to_string()
}
