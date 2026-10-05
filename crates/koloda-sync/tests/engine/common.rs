//! In-process harness: a fresh server data directory on a clock offset from system time, its router reached through
//! `RouterTransport` with no sockets, and engines over in-memory databases.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use axum::body::{to_bytes, Body};
use axum::http::header::{ACCEPT_ENCODING, AUTHORIZATION, CONTENT_ENCODING, CONTENT_TYPE};
use axum::Router;
use koloda::app::db::Database;
use koloda::app::error::AppError;
use koloda::app::secrets::SecretStore;
use koloda_server::clock::Clock;
use koloda_server::server::Server;
use koloda_server::{data_dir, router};
use koloda_sync::engine::Engine;
use koloda_sync::transport::{Method, Request, Response, Sending, Transport, TransportError, CBOR, ZSTD};
use koloda_sync_proto::transport::{Platform, Reply};
use rusqlite::OptionalExtension;
use serde::de::DeserializeOwned;
use tempfile::TempDir;
use uuid::Uuid;

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
            router: router(server),
            _dir: dir,
            clock,
            setup_token,
        }
    }

    /// A blank file with its own engine and transport.
    pub fn device(&self) -> Device {
        let db = Database::in_memory().expect("in-memory database");
        let secrets = Arc::new(MemorySecrets::default());
        let transport = Arc::new(RouterTransport::new(self.router.clone()));
        let engine = Engine::start(db.clone(), secrets.clone(), transport.clone(), Platform::DesktopLinux)
            .expect("engine starts");
        Device {
            db,
            secrets,
            transport,
            engine,
        }
    }

    /// A call the engine does not make, for checking what the server holds.
    pub fn call<T: DeserializeOwned>(&self, method: Method, path: &str, token: &str) -> (u16, Reply<T>) {
        let request = Request {
            method,
            url: format!("{SERVER_URL}{path}"),
            token: Some(token.to_string()),
            body: None,
            is_zstd: false,
        };
        let response = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("test runtime")
            .block_on(forward(&self.router, request));
        (response.status, decode(&response))
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

impl Device {
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

/// What the transport does with the next request instead of a plain round trip.
pub enum Fault {
    /// The server handles the request, but its reply never arrives.
    LoseReply,
    /// The server never sees the request; this reply arrives instead.
    Reply(Response),
}

/// Calls the router in process. Faults queued with `fault` apply to the next requests, one each.
pub struct RouterTransport {
    router: Router,
    faults: Mutex<VecDeque<Fault>>,
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
        self.faults.lock().expect("faults lock").push_back(fault);
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
            let fault = self.faults.lock().expect("faults lock").pop_front();
            match fault {
                Some(Fault::Reply(response)) => Ok(response),
                Some(Fault::LoseReply) => {
                    forward(&self.router, request).await;
                    Err(TransportError("the reply was lost".to_string()))
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

#[derive(Default)]
pub struct MemorySecrets(Mutex<HashMap<String, String>>);

impl MemorySecrets {
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
