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
use koloda_server::restore::{self, RestoreOptions};
use koloda_server::server::Server;
use koloda_server::{backup, data_dir, router};
use koloda_sync::engine::Engine;
use koloda_sync::transport::{Method, Request, Response, Sending, Transport, TransportError, CBOR, ZSTD};
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::payload::{seal, Payload, Seal};
use koloda_sync_proto::registry::Lane;
use koloda_sync_proto::transport::{
    ClaimPairing, Empty, Enrollment, ErrorBody, ErrorCode, IssuePairing, Meta, Outcome, Pairing, PairingClaim,
    Platform, PullPage, Push, PushItem, PushReply, Receipts, Reply, RestoreMode, EPOCH_HEADER, MAX_RECEIPT_RANGE,
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

    pub fn advance(&self, ms: i64) {
        self.0.fetch_add(ms, Ordering::SeqCst);
    }
}

/// The router every transport of a test server calls; a restore swaps it for the new generation's.
type Routes = Arc<Mutex<Router>>;

pub struct TestServer {
    // WHY: dropping the TempDir deletes the data directory, so the harness holds it for its lifetime.
    _dir: TempDir,
    pub clock: Arc<OffsetClock>,
    server: Mutex<Arc<Server>>,
    routes: Routes,
    pub setup_token: String,
}

impl TestServer {
    pub fn new() -> TestServer {
        let dir = tempfile::tempdir().expect("temporary data directory");
        let setup_token = data_dir::init(dir.path(), system_ms()).expect("init a fresh data directory");
        let clock = Arc::new(OffsetClock(AtomicI64::new(0)));
        let server = Arc::new(Server::open(dir.path(), clock.clone()).expect("open the initialized data directory"));
        TestServer {
            routes: Arc::new(Mutex::new(router(Arc::clone(&server)))),
            server: Mutex::new(server),
            _dir: dir,
            clock,
            setup_token,
        }
    }

    pub fn server(&self) -> Arc<Server> {
        Arc::clone(&self.server.lock().expect("server lock"))
    }

    pub fn router(&self) -> Router {
        self.routes.lock().expect("routes lock").clone()
    }

    /// Copies the running server, as `koloda-server backup` does.
    pub fn backup(&self) -> TempDir {
        let out = tempfile::tempdir().expect("backup directory");
        backup::backup(self._dir.path(), out.path(), system_ms()).expect("backup runs");
        out
    }

    /// Restores `out` as `koloda-server restore --yes` does, then serves the new generation to every device.
    pub fn restore(&self, out: &TempDir, mode: RestoreMode) {
        self.restore_with(
            out,
            RestoreOptions {
                mode,
                is_rotating_tokens: false,
            },
        );
    }

    pub fn restore_with(&self, out: &TempDir, options: RestoreOptions) {
        restore::prepare(self._dir.path(), out.path(), options, system_ms())
            .expect("restore prepares")
            .commit()
            .expect("restore commits");
        let server = Arc::new(Server::open(self._dir.path(), self.clock.clone()).expect("open the restored directory"));
        *self.routes.lock().expect("routes lock") = router(Arc::clone(&server));
        *self.server.lock().expect("server lock") = server;
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
        let transport = Arc::new(RouterTransport::new(Arc::clone(&self.routes)));
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

    /// A new engine on the same file and token, as after the app restarts.
    pub fn relaunch(&self, device: &Device) -> Device {
        self.device_on(device.db.clone(), device.secrets.copy())
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

    /// Moves a device's `last_seen` back by `ms`, as if it had made no request for that long.
    ///
    /// WHY: moving the server clock instead would trip every engine's skew guard, since `koloda` stamps with system
    /// time.
    pub fn backdate(&self, device: Uuid, ms: u64) {
        let path = self.generation_dir().join("server.db");
        let conn = Connection::open(path).expect("server.db opens");
        conn.execute(
            "UPDATE devices SET last_seen = last_seen - ?1 WHERE id = ?2",
            rusqlite::params![ms, device.as_bytes().as_slice()],
        )
        .expect("the device is backdated");
    }

    /// The lane and seq of the stored version that holds a write: `group` is `""` for a tombstone.
    pub fn version(&self, space: Uuid, kind: &str, id: &str, group: &str) -> (Lane, u64) {
        let conn = Connection::open(self.space_path(space)).expect("the space database opens");
        let (lane, seq): (String, u64) = conn
            .query_row(
                "SELECT lane, seq FROM versions WHERE kind = ?1 AND id = ?2 AND grp = ?3",
                rusqlite::params![kind, id, group],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("the version is stored");
        (Lane::from_wire(&lane).expect("a known lane"), seq)
    }

    /// Replaces the stored bytes of a version with what `damage` makes of them, as storage damage would, and returns
    /// the bytes it held.
    pub fn damage(&self, space: Uuid, (lane, seq): (Lane, u64), damage: impl FnOnce(&[u8]) -> Vec<u8>) -> Vec<u8> {
        let conn = Connection::open(self.space_path(space)).expect("the space database opens");
        let held: Vec<u8> = conn
            .query_row(
                "SELECT bytes FROM versions WHERE lane = ?1 AND seq = ?2",
                rusqlite::params![lane.as_wire(), seq],
                |row| row.get(0),
            )
            .expect("the version is stored");
        conn.execute(
            "UPDATE versions SET bytes = ?1 WHERE lane = ?2 AND seq = ?3",
            rusqlite::params![damage(&held), lane.as_wire(), seq],
        )
        .expect("the version is replaced");
        held
    }

    pub fn count_leases(&self, space: Uuid) -> i64 {
        let conn = Connection::open(self.space_path(space)).expect("the space database opens");
        conn.query_row("SELECT COUNT(*) FROM leases", [], |row| row.get(0))
            .expect("leases count")
    }

    fn space_path(&self, space: Uuid) -> std::path::PathBuf {
        self.generation_dir().join("spaces").join(format!("{space}.db"))
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
            epoch: token.and_then(|_| self.current_epoch(path)),
            body,
            is_zstd: false,
        })
    }

    /// The current epoch of the space a `/v1/spaces/{space}/...` path names, if it exists.
    pub fn current_epoch(&self, path: &str) -> Option<Uuid> {
        let space = path.strip_prefix("/v1/spaces/")?.split(['/', '?']).next()?;
        let file = self
            .generation_dir()
            .join("spaces")
            .join(format!("{}.db", Uuid::parse_str(space).ok()?));
        if !file.exists() {
            return None;
        }
        Connection::open(file)
            .ok()?
            .query_row("SELECT epoch FROM space WHERE id = 1", [], |row| row.get(0))
            .ok()
    }

    /// The active generation's directory, as `CURRENT` names it.
    pub fn generation_dir(&self) -> std::path::PathBuf {
        let current = std::fs::read_to_string(self._dir.path().join("CURRENT")).expect("read CURRENT");
        self._dir.path().join("generations").join(current.trim())
    }

    pub fn request<T: DeserializeOwned>(&self, request: Request) -> (u16, Reply<T>) {
        let response = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("test runtime")
            .block_on(forward(&self.routes, request));
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
        Space::with(|_| {})
    }

    /// A space whose creator wrote rows with `before` first, so they predate enrollment.
    pub fn with(before: impl FnOnce(&Device)) -> Space {
        let server = TestServer::new();
        let device = server.device();
        before(&device);
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
        let path = format!("/v1/spaces/{}/push", self.space_id());
        Request {
            method: Method::Post,
            url: format!("{SERVER_URL}{path}"),
            token: Some(self.raw.token.clone()),
            epoch: self.server.current_epoch(&path),
            body: Some(cbor(&push)),
            is_zstd: false,
        }
    }

    /// The outcome the server recorded for every seq the device has numbered.
    pub fn outcomes(&self, device: &Device) -> Vec<Outcome> {
        let state = device.state().expect("the device is enrolled");
        let last =
            u64::try_from(device.count("SELECT next_sender_seq - 1 FROM sync_state")).expect("seqs are positive");
        let mut outcomes = Vec::new();
        let mut after = 0;
        while after < last {
            let through = last.min(after + MAX_RECEIPT_RANGE);
            let (status, reply) = self.server.call::<Receipts>(
                Method::Get,
                &format!(
                    "/v1/spaces/{}/receipts?sender={}&after={after}&through={through}",
                    state.space_id, state.device_id
                ),
                &device.token(),
            );
            assert_eq!(status, 200, "receipts read: {:?}", reply.error);
            outcomes.extend(
                reply
                    .ok
                    .expect("receipts")
                    .receipts
                    .into_iter()
                    .map(|receipt| receipt.outcome),
            );
            after = through;
        }
        outcomes
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
    routes: Routes,
    faults: Mutex<VecDeque<(Option<Method>, String, Fault)>>,
    sent: Mutex<Vec<Request>>,
    observer: Mutex<Option<Observer>>,
}

/// Runs before each request is handled, while the engine holds no database lock.
type Observer = Box<dyn FnMut(&Request) + Send>;

impl RouterTransport {
    fn new(routes: Routes) -> RouterTransport {
        RouterTransport {
            routes,
            faults: Mutex::new(VecDeque::new()),
            sent: Mutex::new(Vec::new()),
            observer: Mutex::new(None),
        }
    }

    pub fn observe(&self, observer: impl FnMut(&Request) + Send + 'static) {
        *self.observer.lock().expect("observer lock") = Some(Box::new(observer));
    }

    pub fn fault(&self, fault: Fault) {
        self.fault_on("", fault);
    }

    pub fn fault_on(&self, pattern: &str, fault: Fault) {
        self.faults
            .lock()
            .expect("faults lock")
            .push_back((None, pattern.to_string(), fault));
    }

    /// Like `fault_on`, for the next request with this method only.
    pub fn fault_when(&self, method: Method, pattern: &str, fault: Fault) {
        self.faults
            .lock()
            .expect("faults lock")
            .push_back((Some(method), pattern.to_string(), fault));
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
            if let Some(observer) = self.observer.lock().expect("observer lock").as_mut() {
                observer(&request);
            }
            let fault = {
                let mut faults = self.faults.lock().expect("faults lock");
                faults
                    .iter()
                    .position(|(method, pattern, _)| {
                        method.is_none_or(|method| method == request.method) && request.url.contains(pattern.as_str())
                    })
                    .and_then(|position| faults.remove(position))
                    .map(|(_, _, fault)| fault)
            };
            match fault {
                Some(Fault::Reply(response)) => Ok(response),
                Some(Fault::LoseReply) => {
                    forward(&self.routes, request).await;
                    Err(TransportError("the reply was lost".to_string()))
                }
                Some(Fault::After(others)) => {
                    let response = forward(&self.routes, request).await;
                    for other in others {
                        let status = forward(&self.routes, other).await.status;
                        assert_eq!(status, 200, "a request between the engine's requests is accepted");
                    }
                    Ok(response)
                }
                None => Ok(forward(&self.routes, request).await),
            }
        })
    }
}

async fn forward(routes: &Routes, request: Request) -> Response {
    let router = routes.lock().expect("routes lock").clone();
    let method = match request.method {
        Method::Get => axum::http::Method::GET,
        Method::Post => axum::http::Method::POST,
        Method::Put => axum::http::Method::PUT,
        Method::Delete => axum::http::Method::DELETE,
    };
    let mut builder = axum::http::Request::builder()
        .method(method)
        .uri(request.url)
        .header(ACCEPT_ENCODING, ZSTD);
    if let Some(token) = &request.token {
        builder = builder.header(AUTHORIZATION, format!("Bearer {token}"));
    }
    if let Some(epoch) = request.epoch {
        builder = builder.header(EPOCH_HEADER, epoch.to_string());
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
    let response = tower::ServiceExt::oneshot(router, http_request)
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
            restore: None,
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
