//! In-process harness: a fresh server data directory on a clock offset from system time, its router reached through
//! `RouterTransport` with no sockets, and engines over in-memory databases.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::body::{to_bytes, Body};
use axum::http::header::{ACCEPT_ENCODING, AUTHORIZATION, CONTENT_ENCODING, CONTENT_TYPE};
use axum::Router;
use koloda::app::db::Database;
use koloda::app::error::AppError;
use koloda::app::init::seed_joiner_db;
use koloda::app::secrets::SecretStore;
use koloda::repo::sync::{enroll_device, SpaceRole};
use koloda_server::clock::Clock;
use koloda_server::server::Server;
use koloda_server::{data_dir, router};
use koloda_sync::engine::Engine;
use koloda_sync::transport::{Method, Request, Response, Sending, Transport, TransportError, CBOR, ZSTD};
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::payload::{seal, Payload, Seal};
use koloda_sync_proto::registry::Lane;
use koloda_sync_proto::transport::{
    ClaimPairing, Empty, Enrollment, ErrorBody, ErrorCode, IssuePairing, Meta, Pairing, PairingClaim, Platform,
    PullPage, Push, PushItem, PushReply, Reply,
};
use rusqlite::backup::Backup;
use rusqlite::{Connection, OptionalExtension};
use serde::de::DeserializeOwned;
use serde::Serialize;
use tempfile::TempDir;
use uuid::Uuid;

use crate::fixtures::{seed_settings, starter};

pub const SERVER_URL: &str = "https://sync.test";

/// System time plus an offset the test moves. `koloda` stamps with system time, so the server's clock moves
/// relative to it instead of being set outright.
pub struct OffsetClock(AtomicI64);

impl Clock for OffsetClock {
    fn now_ms(&self) -> u64 {
        system_ms().saturating_add_signed(self.0.load(Ordering::SeqCst))
    }
}

impl OffsetClock {
    pub fn set_offset(&self, offset_ms: i64) {
        self.0.store(offset_ms, Ordering::SeqCst);
    }
}

pub struct TestServer {
    // WHY: dropping the TempDir deletes the data directory, so the harness holds it for its lifetime.
    _dir: TempDir,
    pub clock: Arc<OffsetClock>,
    pub server: Arc<Server>,
    pub router: Router,
    pub setup_token: String,
}

impl TestServer {
    pub fn new() -> TestServer {
        let dir = tempfile::tempdir().expect("temporary data directory");
        let setup_token = data_dir::init(dir.path(), system_ms()).expect("init a fresh data directory");
        let clock = Arc::new(OffsetClock(AtomicI64::new(0)));
        let server = Arc::new(Server::open(dir.path(), clock.clone()).expect("open the initialized data directory"));
        TestServer {
            router: router(Arc::clone(&server)),
            server,
            _dir: dir,
            clock,
            setup_token,
        }
    }

    /// A blank file with its own engine and transport.
    pub fn device(&self) -> Device {
        self.device_on(
            Database::in_memory().expect("in-memory database"),
            MemorySecrets::default(),
        )
    }

    fn device_on(&self, db: Database, secrets: MemorySecrets) -> Device {
        let secrets = Arc::new(secrets);
        let transport = Arc::new(RouterTransport::new(self.router.clone()));
        let engine = Engine::start(
            db.clone(),
            secrets.clone(),
            transport.clone(),
            Platform::DesktopLinux,
            starter(),
        )
        .expect("engine starts");
        Device {
            db,
            secrets,
            transport,
            engine,
        }
    }

    /// A second engine in the creator's space: a blank file seeded as a joiner and enrolled through a claim the test
    /// makes, so it pulls from 0 with no bootstrap.
    pub fn join(&self, creator: &Device) -> Device {
        let enrollment = self.pair(creator);
        let device_id = Uuid::from_bytes(enrollment.device_id);
        let joiner = self.device();
        joiner
            .secrets
            .set(&format!("sync.token.{device_id}"), &enrollment.token)
            .expect("the token is stored");
        seed_joiner_db(&joiner.db, seed_settings()).expect("the joiner seeds its settings");
        enroll_device(
            &joiner.db,
            device_id,
            Uuid::from_bytes(enrollment.space_id),
            SpaceRole::Joiner,
            Uuid::from_bytes(enrollment.epoch),
            SERVER_URL,
        )
        .expect("the joiner enrolls");
        joiner
    }

    /// A copy of the device's file with the same token, as a restored backup or a copied file holds.
    pub fn copy(&self, device: &Device) -> Device {
        let mut conn = Connection::open_in_memory().expect("in-memory database");
        device
            .db
            .with_conn(|source| {
                Backup::new(source, &mut conn)?.run_to_completion(64, Duration::ZERO, None)?;
                Ok(())
            })
            .expect("the file copies");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys turn on");
        self.device_on(Database::new(conn), device.secrets.copy())
    }

    /// A call the engine does not make, for checking what the server holds.
    pub fn call<T: DeserializeOwned>(&self, method: Method, path: &str, token: &str) -> (u16, Reply<T>) {
        self.send(method, path, Some(token), None)
    }

    pub fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        token: Option<&str>,
        body: &B,
    ) -> (u16, Reply<T>) {
        self.send(Method::Post, path, token, Some(cbor(body)))
    }

    fn send<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        token: Option<&str>,
        body: Option<Vec<u8>>,
    ) -> (u16, Reply<T>) {
        self.request(Request {
            method,
            url: format!("{SERVER_URL}{path}"),
            token: token.map(str::to_string),
            body,
            is_zstd: false,
        })
    }

    pub fn request<T: DeserializeOwned>(&self, request: Request) -> (u16, Reply<T>) {
        let response = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("test runtime")
            .block_on(forward(&self.router, request));
        (response.status, decode(&response))
    }

    /// Enrolls a raw client in the device's space through a pairing code the device's token issues.
    pub fn pair(&self, device: &Device) -> Enrollment {
        let space = device.state().expect("the device is enrolled").space_id;
        let (_, issued) = self.post::<_, Pairing>(
            &format!("/v1/spaces/{space}/pairings"),
            Some(&device.token()),
            &IssuePairing::default(),
        );
        let code = issued.ok.expect("a pairing code").code;
        let (_, claimed) = self.post::<_, PairingClaim>(
            "/v1/pairings/claim",
            None,
            &ClaimPairing {
                code,
                name: "Raw client".to_string(),
                platform: Platform::DesktopMac,
                nonce: *Uuid::new_v4().as_bytes(),
            },
        );
        claimed.ok.expect("the claim enrolls the raw client").enrollment
    }
}

/// The engine's device in a space it created, and a raw client in the same space that pushes hand-sealed envelopes.
pub struct Space {
    pub server: TestServer,
    pub device: Device,
    pub raw: Enrollment,
    raw_seq: AtomicU64,
}

impl Space {
    pub fn new() -> Space {
        let server = TestServer::new();
        let device = server.device();
        device
            .engine
            .create_space(SERVER_URL, &server.setup_token, "Study", "Laptop")
            .expect("space is created");
        let raw = server.pair(&device);
        Space {
            server,
            device,
            raw,
            raw_seq: AtomicU64::new(1),
        }
    }

    pub fn space_id(&self) -> Uuid {
        Uuid::from_bytes(self.raw.space_id)
    }

    /// A stamp `ahead_ms` past system time, minted by the raw client.
    pub fn raw_stamp(&self, ahead_ms: u64) -> Stamp {
        Stamp {
            hlc: Hlc::new(system_ms() + ahead_ms, 0).expect("wall time fits"),
            device: DeviceId(self.raw.device_id),
        }
    }

    /// Seals and pushes one envelope from the raw client at its next seq.
    pub fn raw_push(&self, id: &str, parent: Option<&str>, stamp: Stamp, payload: &Payload) -> PushReply {
        let request = self.raw_request(vec![(
            id.to_string(),
            parent.map(str::to_string),
            stamp,
            payload.clone(),
        )]);
        let (status, reply) = self.server.request::<PushReply>(request);
        assert_eq!(status, 200, "the raw push is accepted: {:?}", reply.error);
        reply.ok.expect("a push reply")
    }

    /// A push of hand-sealed envelopes in one commit from the raw client at its next seqs, to send later.
    pub fn raw_request(&self, items: Vec<(String, Option<String>, Stamp, Payload)>) -> Request {
        let commit_id = *Uuid::new_v4().as_bytes();
        let push = Push {
            items: items
                .into_iter()
                .map(|(id, parent, stamp, payload)| PushItem {
                    sender_seq: self.raw_seq.fetch_add(1, Ordering::SeqCst),
                    envelope: seal(
                        Seal {
                            id,
                            parent,
                            stamp,
                            commit_id,
                        },
                        &payload,
                    )
                    .expect("payload seals")
                    .bytes,
                })
                .collect(),
        };
        Request {
            method: Method::Post,
            url: format!("{SERVER_URL}/v1/spaces/{}/push", self.space_id()),
            token: Some(self.raw.token.clone()),
            body: Some(cbor(&push)),
            is_zstd: false,
        }
    }

    /// What other senders pushed to a lane after `after`, as the raw client pulls it.
    pub fn raw_pull(&self, lane: Lane, after: u64) -> PullPage {
        let lane = match lane {
            Lane::Hot => "hot",
            Lane::Cold => "cold",
        };
        let (status, reply) = self.server.call::<PullPage>(
            Method::Get,
            &format!("/v1/spaces/{}/pull?lane={lane}&after={after}", self.space_id()),
            &self.raw.token,
        );
        assert_eq!(status, 200, "the raw pull is accepted: {:?}", reply.error);
        reply.ok.expect("a pull page")
    }
}

pub struct Device {
    pub db: Database,
    pub secrets: Arc<MemorySecrets>,
    pub transport: Arc<RouterTransport>,
    pub engine: Engine,
}

type StateRow = (Vec<u8>, Vec<u8>, String, Option<String>, Option<Vec<u8>>);

/// The file's `sync_state` row, read with SQL.
pub struct State {
    pub device_id: Uuid,
    pub space_id: Uuid,
    pub role: String,
    pub server_url: Option<String>,
    pub epoch: Option<[u8; 16]>,
}

/// One outbox row as the engine left it.
pub struct OutboxRow {
    pub in_flight: bool,
    pub envelope: Envelope,
}

impl Device {
    pub fn token(&self) -> String {
        let device = self.state().expect("the device is enrolled").device_id;
        self.secrets
            .get(&format!("sync.token.{device}"))
            .expect("the secret store reads")
            .expect("the device has a token")
    }

    pub fn outbox(&self) -> Vec<OutboxRow> {
        let rows: Vec<(bool, Vec<u8>)> = self
            .db
            .with_conn(|conn| {
                let rows = conn
                    .prepare("SELECT in_flight, envelope FROM sync_outbox ORDER BY sender_seq")?
                    .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .expect("outbox reads");
        rows.into_iter()
            .map(|(in_flight, envelope)| OutboxRow {
                in_flight,
                envelope: Envelope::decode(&envelope).expect("outbox envelope decodes"),
            })
            .collect()
    }

    pub fn cohort_states(&self) -> Vec<String> {
        self.db
            .with_conn(|conn| {
                let states = conn
                    .prepare("SELECT state FROM sync_cohorts ORDER BY state")?
                    .query_map([], |row| row.get(0))?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(states)
            })
            .expect("cohorts read")
    }

    pub fn count(&self, sql: &str) -> i64 {
        self.db
            .with_conn(|conn| Ok(conn.query_row(sql, [], |row| row.get(0))?))
            .expect("count query runs")
    }

    pub fn text(&self, sql: &str) -> String {
        self.db
            .with_conn(|conn| Ok(conn.query_row(sql, [], |row| row.get(0))?))
            .expect("text query runs")
    }

    /// Sets up a state that no sequence of product writes reaches.
    pub fn execute(&self, sql: &str) {
        self.db
            .with_conn(|conn| {
                conn.execute_batch(sql)?;
                Ok(())
            })
            .expect("setup SQL runs");
    }

    pub fn state(&self) -> Option<State> {
        self.db
            .with_conn(|conn| {
                let row: Option<StateRow> = conn
                    .query_row(
                        "SELECT device_id, space_id, role, server_url, epoch FROM sync_state WHERE id = 1",
                        [],
                        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
                    )
                    .optional()?;
                Ok(row.map(|(device_id, space_id, role, server_url, epoch)| State {
                    device_id: Uuid::from_slice(&device_id).expect("device id is a UUID"),
                    space_id: Uuid::from_slice(&space_id).expect("space id is a UUID"),
                    role,
                    server_url,
                    epoch: epoch.map(|epoch| <[u8; 16]>::try_from(epoch.as_slice()).expect("epoch is 16 bytes")),
                }))
            })
            .expect("sync state reads")
    }
}

/// What the transport does with a request instead of a plain round trip.
pub enum Fault {
    /// The server handles the request, but its reply never arrives.
    LoseReply,
    /// The server never sees the request; this reply arrives instead.
    Reply(Response),
    /// The server handles the request, then these other requests, and the first reply arrives.
    After(Vec<Request>),
}

/// Calls the router in process. Each queued fault applies once, to the next request whose URL contains its pattern.
pub struct RouterTransport {
    router: Router,
    faults: Mutex<VecDeque<(String, Fault)>>,
    sent: Mutex<Vec<Request>>,
}

impl RouterTransport {
    pub fn new(router: Router) -> RouterTransport {
        RouterTransport {
            router,
            faults: Mutex::new(VecDeque::new()),
            sent: Mutex::new(Vec::new()),
        }
    }

    pub fn fault(&self, fault: Fault) {
        self.fault_on("", fault);
    }

    pub fn fault_on(&self, pattern: &str, fault: Fault) {
        self.faults
            .lock()
            .expect("faults lock")
            .push_back((pattern.to_string(), fault));
    }

    /// Every request the engine sent, faulted ones included.
    pub fn sent(&self) -> Vec<Request> {
        self.sent.lock().expect("sent lock").clone()
    }
}

impl Transport for RouterTransport {
    fn send(&self, request: Request) -> Sending<'_> {
        Box::pin(async move {
            self.sent.lock().expect("sent lock").push(request.clone());
            let fault = {
                let mut faults = self.faults.lock().expect("faults lock");
                faults
                    .iter()
                    .position(|(pattern, _)| request.url.contains(pattern.as_str()))
                    .and_then(|position| faults.remove(position))
                    .map(|(_, fault)| fault)
            };
            match fault {
                Some(Fault::Reply(response)) => Ok(response),
                Some(Fault::LoseReply) => {
                    forward(&self.router, request).await;
                    Err(TransportError("the reply was lost".to_string()))
                }
                Some(Fault::After(others)) => {
                    let response = forward(&self.router, request).await;
                    for other in others {
                        let status = forward(&self.router, other).await.status;
                        assert_eq!(status, 200, "a request between the engine's requests is accepted");
                    }
                    Ok(response)
                }
                None => Ok(forward(&self.router, request).await),
            }
        })
    }
}

async fn forward(router: &Router, request: Request) -> Response {
    let method = match request.method {
        Method::Get => axum::http::Method::GET,
        Method::Post => axum::http::Method::POST,
        Method::Delete => axum::http::Method::DELETE,
    };
    let mut builder = axum::http::Request::builder()
        .method(method)
        .uri(request.url)
        .header(ACCEPT_ENCODING, ZSTD);
    if let Some(token) = &request.token {
        builder = builder.header(AUTHORIZATION, format!("Bearer {token}"));
    }
    if request.body.is_some() {
        builder = builder.header(CONTENT_TYPE, CBOR);
    }
    if request.is_zstd {
        builder = builder.header(CONTENT_ENCODING, ZSTD);
    }
    let http_request = builder
        .body(request.body.map_or_else(Body::empty, Body::from))
        .expect("build a request");
    let response = tower::ServiceExt::oneshot(router.clone(), http_request)
        .await
        .expect("the router never fails");
    let status = response.status().as_u16();
    let is_zstd = response
        .headers()
        .get(CONTENT_ENCODING)
        .is_some_and(|encoding| encoding == ZSTD);
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("read the response body")
        .to_vec();
    Response { status, body, is_zstd }
}

fn decode<T: DeserializeOwned>(response: &Response) -> Reply<T> {
    let bytes = if response.is_zstd {
        zstd::decode_all(response.body.as_slice()).expect("decode a zstd reply")
    } else {
        response.body.clone()
    };
    ciborium::from_reader(bytes.as_slice()).expect("every response is a CBOR reply")
}

/// An error reply shaped as the server sends one, for a fault to answer with.
pub fn error_reply(status: u16, code: ErrorCode) -> Response {
    let reply: Reply<Empty> = Reply {
        meta: Meta {
            server_time_ms: system_ms(),
            epoch: None,
            device: None,
        },
        ok: None,
        error: Some(ErrorBody {
            code,
            message: "injected by the test".to_string(),
        }),
    };
    Response {
        status,
        body: cbor(&reply),
        is_zstd: false,
    }
}

fn cbor<B: Serialize>(body: &B) -> Vec<u8> {
    let mut bytes = Vec::new();
    ciborium::into_writer(body, &mut bytes).expect("encode a test body");
    bytes
}

#[derive(Default)]
pub struct MemorySecrets(Mutex<HashMap<String, String>>);

impl MemorySecrets {
    pub fn copy(&self) -> MemorySecrets {
        MemorySecrets(Mutex::new(self.secrets().clone()))
    }

    pub fn keys(&self) -> Vec<String> {
        self.secrets().keys().cloned().collect()
    }

    fn secrets(&self) -> MutexGuard<'_, HashMap<String, String>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl SecretStore for MemorySecrets {
    fn get(&self, key: &str) -> Result<Option<String>, AppError> {
        Ok(self.secrets().get(key).cloned())
    }

    fn set(&self, key: &str, value: &str) -> Result<(), AppError> {
        self.secrets().insert(key.to_string(), value.to_string());
        Ok(())
    }

    fn remove(&self, key: &str) -> Result<(), AppError> {
        self.secrets().remove(key);
        Ok(())
    }
}

pub fn system_ms() -> u64 {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time is after 1970");
    u64::try_from(elapsed.as_millis()).expect("milliseconds fit in u64")
}
