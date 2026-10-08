//! In-process harness: a fresh data directory, a manual clock, and the router called without sockets.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::extract::ConnectInfo;
use axum::http::header::{ACCEPT_ENCODING, AUTHORIZATION, CONTENT_ENCODING};
use axum::http::{Method, Request, StatusCode};
use axum::Router;
use koloda_server::clock::Clock;
use koloda_server::data_dir;
use koloda_server::quota::{FreeSpace, Storage};
use koloda_server::router;
use koloda_server::server::Server;
use koloda_sync_proto::envelope::{Envelope, Header, Refs};
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::payload::SCHEMA;
use koloda_sync_proto::registry::{Group, Kind, Op};
use koloda_sync_proto::transport::{
    encode_schemas, ClaimPairing, CreateSpace, DeviceInfo, DeviceMeta, Enrollment, ErrorCode, IssuePairing, Outcome,
    Pairing, PairingClaim, Platform, PullPage, Push, PushItem, PushReply, Reply, EPOCH_HEADER, SCHEMAS_HEADER,
};
use serde::de::DeserializeOwned;
use serde::Serialize;
use tempfile::TempDir;
use uuid::Uuid;

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

/// A volume whose free bytes the test sets.
pub struct TestDisk(pub AtomicU64);

impl FreeSpace for TestDisk {
    fn free_bytes(&self, _path: &std::path::Path) -> Option<u64> {
        Some(self.0.load(Ordering::SeqCst))
    }
}

pub struct Harness {
    // WHY: dropping the TempDir deletes the data directory, so the harness holds it for its lifetime.
    _dir: TempDir,
    pub clock: Arc<ManualClock>,
    pub server: Arc<Server>,
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
    epoch: Epoch,
    schemas: Schemas,
}

/// The `koloda-epoch` header a call sends.
enum Epoch {
    /// The space's current epoch, read from its database, on a call with a token to a space path.
    Current,
    Named(Uuid),
    Missing,
}

/// The `koloda-schemas` header a call sends.
enum Schemas {
    /// Schema `SCHEMA` for every kind, on a call with a token.
    Current,
    Named(String),
    Missing,
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
        Harness::open(dir, setup_token)
    }

    /// A fresh server whose disk watermarks read free space from `disk`.
    pub fn with_disk(disk: Arc<TestDisk>, min_free_disk: u64, reserve_disk: u64) -> Harness {
        let dir = tempfile::tempdir().expect("temporary data directory");
        let setup_token = data_dir::init(dir.path(), START_MS).expect("init a fresh data directory");
        let storage = Storage {
            min_free_disk,
            reserve_disk,
            free_space: disk,
        };
        Harness::open_with(dir, setup_token, storage)
    }

    /// Serves a data directory that already holds a server, such as one a restore created.
    pub fn open(dir: TempDir, setup_token: String) -> Harness {
        Harness::open_with(dir, setup_token, Storage::default())
    }

    fn open_with(dir: TempDir, setup_token: String, storage: Storage) -> Harness {
        let clock = Arc::new(ManualClock(AtomicU64::new(START_MS)));
        let server = Arc::new(
            Server::open_with(dir.path(), clock.clone(), storage).expect("open the initialized data directory"),
        );
        Harness {
            router: router(Arc::clone(&server)),
            server,
            _dir: dir,
            clock,
            setup_token,
        }
    }

    /// Opens the data directory again, as `serve` does when it starts after a restore moved `CURRENT`.
    pub fn reopen(&mut self) {
        self.server = Arc::new(Server::open(self._dir.path(), self.clock.clone()).expect("open the data directory"));
        self.router = router(Arc::clone(&self.server));
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
            epoch: Epoch::Current,
            schemas: Schemas::Current,
        }
    }

    pub fn get(&self, path: impl Into<String>) -> Call<'_> {
        self.call(Method::GET, path)
    }

    pub fn post(&self, path: impl Into<String>) -> Call<'_> {
        self.call(Method::POST, path)
    }

    pub fn data_dir(&self) -> &std::path::Path {
        self._dir.path()
    }

    /// The current epoch of the space a `/v1/spaces/{space}/...` path names, if it exists.
    fn current_epoch(&self, path: &str) -> Option<Uuid> {
        let space = path.strip_prefix("/v1/spaces/")?.split(['/', '?']).next()?;
        let file = self
            .generation_dir()
            .join("spaces")
            .join(format!("{}.db", Uuid::parse_str(space).ok()?));
        if !file.exists() {
            return None;
        }
        rusqlite::Connection::open(file)
            .ok()?
            .query_row("SELECT epoch FROM space WHERE id = 1", [], |row| row.get(0))
            .ok()
    }

    /// The active generation's directory, as `CURRENT` names it.
    pub fn generation_dir(&self) -> PathBuf {
        let current = std::fs::read_to_string(self._dir.path().join("CURRENT")).expect("read CURRENT");
        self._dir.path().join("generations").join(current.trim())
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

    /// Sends `epoch` as the epoch this device last saw, instead of the space's current one.
    pub fn epoch(mut self, epoch: Uuid) -> Self {
        self.epoch = Epoch::Named(epoch);
        self
    }

    pub fn without_epoch(mut self) -> Self {
        self.epoch = Epoch::Missing;
        self
    }

    /// Sends `schemas` as the schemas this device writes, instead of `SCHEMA` for every kind.
    pub fn schemas(mut self, schemas: &str) -> Self {
        self.schemas = Schemas::Named(schemas.to_string());
        self
    }

    pub fn without_schemas(mut self) -> Self {
        self.schemas = Schemas::Missing;
        self
    }

    pub async fn send<T: DeserializeOwned>(self) -> Answer<T> {
        let epoch = match self.epoch {
            Epoch::Named(epoch) => Some(epoch),
            Epoch::Missing => None,
            Epoch::Current => self.token.as_ref().and_then(|_| self.harness.current_epoch(&self.path)),
        };
        let schemas = match self.schemas {
            Schemas::Named(schemas) => Some(schemas),
            Schemas::Missing => None,
            Schemas::Current => self.token.as_ref().map(|_| encode_schemas(|_| SCHEMA)),
        };
        let mut request = Request::builder().method(self.method).uri(self.path);
        if let Some(token) = &self.token {
            request = request.header(AUTHORIZATION, format!("Bearer {token}"));
        }
        if let Some(epoch) = epoch {
            request = request.header(EPOCH_HEADER, epoch.to_string());
        }
        if let Some(schemas) = schemas {
            request = request.header(SCHEMAS_HEADER, schemas);
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

/// A stamp `offset_ms` after `START_MS`, minted by the device whose UUID bytes are all `device`.
pub fn stamp(offset_ms: u64, counter: u16, device: u8) -> Stamp {
    Stamp {
        hlc: Hlc::new(START_MS + offset_ms, counter).expect("a test stamp fits in 48 bits"),
        device: DeviceId([device; 16]),
    }
}

pub fn write(kind: Kind, id: &str, group: Group, stamp: Stamp) -> Header {
    Header {
        kind,
        id: id.to_string(),
        parent: None,
        refs: Refs::default(),
        group: Some(group),
        op: Op::Write,
        stamp,
        schema: SCHEMA,
        commit_id: [0xc0; 16],
    }
}

pub fn child(kind: Kind, id: &str, parent: &str, group: Group, stamp: Stamp) -> Header {
    Header {
        parent: Some(parent.to_string()),
        ..write(kind, id, group, stamp)
    }
}

pub fn card_create(id: &str, deck: &str, template: &str, stamp: Stamp) -> Header {
    Header {
        refs: Refs {
            template_id: Some(template.to_string()),
            ..Refs::default()
        },
        ..child(Kind::Cards, id, deck, Group::Create, stamp)
    }
}

/// The server never decodes a payload, so test envelopes carry bytes that are not CBOR at all.
pub fn encode(header: Header) -> Vec<u8> {
    Envelope {
        header,
        payload: b"\xffopaque payload".to_vec(),
    }
    .encode()
    .expect("encode a valid test header")
}

pub fn batch(items: Vec<(u64, Header)>) -> Push {
    Push {
        items: items
            .into_iter()
            .map(|(sender_seq, header)| PushItem {
                sender_seq,
                envelope: encode(header),
            })
            .collect(),
    }
}

pub fn outcomes(reply: PushReply) -> Vec<(u64, Outcome, bool)> {
    reply
        .outcomes
        .into_iter()
        .map(|outcome| (outcome.sender_seq, outcome.outcome, outcome.replayed))
        .collect()
}

impl Harness {
    pub async fn push(&self, device: &Enrollment, items: Vec<(u64, Header)>) -> Answer<PushReply> {
        self.push_body(device, &batch(items)).await
    }

    pub async fn push_body(&self, device: &Enrollment, push: &Push) -> Answer<PushReply> {
        self.post(format!("/v1/spaces/{}/push", uuid(device.space_id)))
            .token(&device.token)
            .body(push)
            .send::<PushReply>()
            .await
    }

    pub async fn device_meta(&self, device: &Enrollment) -> DeviceMeta {
        self.get(format!(
            "/v1/spaces/{}/devices/{}",
            uuid(device.space_id),
            uuid(device.device_id)
        ))
        .token(&device.token)
        .send::<DeviceInfo>()
        .await
        .reply
        .meta
        .device
        .expect("a device call carries device meta")
    }
}

pub fn tombstone(kind: Kind, id: &str, parent: Option<&str>, stamp: Stamp) -> Header {
    Header {
        parent: parent.map(str::to_string),
        group: None,
        op: Op::Delete,
        ..write(kind, id, Group::Create, stamp)
    }
}

impl Harness {
    /// Pulls with `query` after `?`, such as `lane=hot&after=0`.
    pub async fn pull(&self, device: &Enrollment, query: &str) -> Answer<PullPage> {
        self.get(format!("/v1/spaces/{}/pull?{query}", uuid(device.space_id)))
            .token(&device.token)
            .send::<PullPage>()
            .await
    }
}

/// `(seq, sender_seq)` of each entry, for pages whose sender is known.
pub fn seqs(page: &PullPage) -> Vec<(u64, u64)> {
    page.entries.iter().map(|entry| (entry.seq, entry.sender_seq)).collect()
}
