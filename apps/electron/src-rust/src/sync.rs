//! The sync engine on the desktop: the one `Engine` a `KolodaDb` starts, its background runner, and the wire shapes
//! and `sync.*` error codes the renderer reads (`apps/electron/IPC.md` §Sync).
//!
//! INVARIANT: host calls run on the sync worker, never on the database worker: they wait on the network.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};

use koloda::app::db::Database;
use koloda::app::error::{error_codes, AppError};
use koloda::app::secrets::get_secret_store;
use koloda::domain::algorithms::InsertAlgorithmData;
use koloda::domain::templates::InsertTemplateData;
use koloda::repo::sync::apply::{Hold, HoldReason};
use koloda::repo::sync::join::JoinMode;
use koloda::repo::sync::repair::Starter;
use koloda_sync::disk::SystemDisk;
use koloda_sync::engine::Engine;
use koloda_sync::error::SyncError;
use koloda_sync::runner::{Event, EventSink, TokioTimer};
use koloda_sync::status::{State, Status, Stop};
use koloda_sync::transport::HttpTransport;
use koloda_sync_proto::transport::{ErrorCode, Platform};
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use serde::{Deserialize, Serialize};

/// Codes a host call fails with; `libs/app` `ERROR_MESSAGES` has a message for each (`error-parity.test.ts`).
pub mod sync_error_codes {
    pub const UNREACHABLE: &str = "sync.unreachable";
    pub const UNAUTHORIZED: &str = "sync.unauthorized";
    pub const PAIRING_FAILED: &str = "sync.pairing-failed";
    pub const RATE_LIMITED: &str = "sync.rate-limited";
    pub const SERVER: &str = "sync.server";
    pub const ALREADY_ENROLLED: &str = "sync.already-enrolled";
    pub const NOT_ENROLLED: &str = "sync.not-enrolled";
    pub const DETACHED: &str = "sync.detached";
    pub const PAIR_AGAIN: &str = "sync.pair-again";
    pub const RESTORE_HELD: &str = "sync.restore-held";
    pub const CLOCK_SKEW: &str = "sync.clock-skew";
    pub const ATTACHED_ELSEWHERE: &str = "sync.attached-elsewhere";
    pub const CANNOT_JOIN: &str = "sync.cannot-join";
    pub const INSECURE_SERVER_URL: &str = "sync.insecure-server-url";
    pub const LOW_DISK: &str = "sync.low-disk";
    pub const FAILED: &str = "sync.failed";
}

pub type EventCallback = ThreadsafeFunction<serde_json::Value, ErrorStrategy::Fatal>;

#[derive(Deserialize)]
pub struct StarterWire {
    algorithm: InsertAlgorithmData,
    template: InsertTemplateData,
}

pub struct SyncHost {
    db: Database,
    engine: OnceLock<Engine>,
    sink: OnceLock<Arc<dyn EventSink>>,
    is_running: AtomicBool,
}

impl SyncHost {
    pub fn new(db: Database) -> SyncHost {
        SyncHost {
            db,
            engine: OnceLock::new(),
            sink: OnceLock::new(),
            is_running: AtomicBool::new(false),
        }
    }

    // WHY: the renderer starts sync on every load; a reload must not start a second engine or runner.
    pub fn start(&self, starter: StarterWire, on_event: EventCallback) -> Result<Status, SyncError> {
        let engine = match self.engine.get() {
            Some(engine) => engine,
            None => {
                let engine = Engine::start(
                    self.db.clone(),
                    get_secret_store()?,
                    Arc::new(HttpTransport::new()?),
                    Arc::new(SystemDisk),
                    platform(),
                    Starter {
                        algorithm: starter.algorithm,
                        template: starter.template,
                    },
                )?;
                self.engine.get_or_init(|| engine)
            }
        };
        self.sink.get_or_init(|| Arc::new(JsSink(on_event)));
        let status = engine.status()?;
        if is_in_space(&status) {
            self.start_runner()?;
        }
        Ok(status)
    }

    pub fn engine(&self) -> Result<&Engine, SyncError> {
        self.engine.get().ok_or_else(|| {
            SyncError::Local(AppError::new(
                error_codes::UNKNOWN,
                Some("the sync engine has not started".to_string()),
            ))
        })
    }

    pub fn notify_local_change(&self) {
        // WHY: a write before the engine starts waits in the outbox; the runner's first cycle pushes it.
        if let Some(engine) = self.engine.get() {
            engine.notify_local_change();
        }
    }

    pub fn nudge(&self) {
        if let Some(engine) = self.engine.get() {
            engine.nudge();
        }
    }

    // INVARIANT: the runner never runs on a file in no space; there every cycle fails and emits an `Error`.
    fn start_runner(&self) -> Result<(), SyncError> {
        let (Some(engine), Some(sink)) = (self.engine.get(), self.sink.get()) else {
            return Ok(());
        };
        if !self.is_running.swap(true, Ordering::SeqCst) {
            engine.start_runner(Arc::clone(sink), Arc::new(TokioTimer))?;
        }
        Ok(())
    }
}

fn platform() -> Platform {
    if cfg!(target_os = "windows") {
        Platform::DesktopWin
    } else if cfg!(target_os = "macos") {
        Platform::DesktopMac
    } else {
        Platform::DesktopLinux
    }
}

fn is_in_space(status: &Status) -> bool {
    // WHY: a revoked or detached file shows `Revoked`, or `Restored` when a restore detached it.
    !matches!(
        status.state,
        State::NotEnrolled | State::Stopped(Stop::Revoked | Stop::Restored)
    )
}

struct JsSink(EventCallback);

impl EventSink for JsSink {
    fn send(&self, event: Event) {
        // WHY: the wire types serialize to JSON objects with string keys, which cannot fail.
        if let Ok(value) = serde_json::to_value(EventWire::from(event)) {
            self.0.call(value, ThreadsafeFunctionCallMode::NonBlocking);
        }
    }
}

pub fn to_app_error(error: SyncError) -> AppError {
    match error {
        SyncError::Local(error) => error,
        other => AppError::new(error_code(&other), Some(other.to_string())),
    }
}

fn error_code(error: &SyncError) -> &'static str {
    use sync_error_codes as codes;
    match error {
        SyncError::Local(_) => error_codes::UNKNOWN,
        SyncError::Transport(_) => codes::UNREACHABLE,
        SyncError::Server {
            code: ErrorCode::Unauthorized,
            ..
        } => codes::UNAUTHORIZED,
        SyncError::Server {
            code: ErrorCode::PairingFailed,
            ..
        } => codes::PAIRING_FAILED,
        SyncError::Server {
            code: ErrorCode::RateLimited,
            ..
        } => codes::RATE_LIMITED,
        SyncError::Server { .. } | SyncError::PushRefused { .. } => codes::SERVER,
        SyncError::AlreadyEnrolled => codes::ALREADY_ENROLLED,
        SyncError::NotEnrolled => codes::NOT_ENROLLED,
        SyncError::Revoked | SyncError::Detached => codes::DETACHED,
        SyncError::UnknownDevice | SyncError::PairAgain => codes::PAIR_AGAIN,
        SyncError::RestoreHeld => codes::RESTORE_HELD,
        SyncError::ClockSkew { .. } => codes::CLOCK_SKEW,
        SyncError::CannotJoin(JoinMode::AttachedElsewhere) => codes::ATTACHED_ELSEWHERE,
        SyncError::CannotJoin(_) => codes::CANNOT_JOIN,
        SyncError::InsecureServerUrl(_) => codes::INSECURE_SERVER_URL,
        SyncError::LowDisk { .. } => codes::LOW_DISK,
        SyncError::Behind
        | SyncError::Restored { .. }
        | SyncError::BudgetSpent
        | SyncError::Held(_)
        | SyncError::Metered { .. } => codes::FAILED,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusWire {
    state: StateWire,
    last_success_at: Option<i64>,
    pending: usize,
    held: usize,
    uploads: usize,
    fetches: usize,
    lag_hot: Option<u64>,
    lag_cold: Option<u64>,
    skew_ms: i64,
    hold: Option<HoldWire>,
    is_over_quota: bool,
    push_resumes_at: Option<i64>,
}

// WHY: no `metered`: the desktop reports an unmetered network, so nothing waits on one.
impl From<Status> for StatusWire {
    fn from(status: Status) -> StatusWire {
        StatusWire {
            state: status.state.into(),
            last_success_at: status.last_success_ms,
            pending: status.pending,
            held: status.held,
            uploads: status.uploads,
            fetches: status.fetches,
            lag_hot: status.lag_hot,
            lag_cold: status.lag_cold,
            skew_ms: status.skew_ms,
            hold: status.hold.map(HoldWire::from),
            is_over_quota: status.is_over_quota,
            push_resumes_at: status.push_resumes_at_ms,
        }
    }
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum StateWire {
    NotEnrolled,
    ImportPending,
    Bootstrapping,
    Idle,
    Syncing,
    Stopped { stop: StopWire },
}

impl From<State> for StateWire {
    fn from(state: State) -> StateWire {
        match state {
            State::NotEnrolled => StateWire::NotEnrolled,
            State::ImportPending => StateWire::ImportPending,
            State::Bootstrapping => StateWire::Bootstrapping,
            State::Idle => StateWire::Idle,
            State::Syncing => StateWire::Syncing,
            State::Stopped(stop) => StateWire::Stopped { stop: stop.into() },
        }
    }
}

#[derive(Serialize)]
#[serde(tag = "reason", rename_all = "camelCase")]
enum StopWire {
    ClockSkew,
    Revoked,
    UnknownDevice,
    AuthoritativeRestore,
    Restored,
    PushRefused { code: ErrorCode },
    LowDisk { needed: u64, free: u64 },
    Error { message: String },
}

impl From<Stop> for StopWire {
    fn from(stop: Stop) -> StopWire {
        match stop {
            Stop::ClockSkew => StopWire::ClockSkew,
            Stop::Revoked => StopWire::Revoked,
            Stop::UnknownDevice => StopWire::UnknownDevice,
            Stop::AuthoritativeRestore => StopWire::AuthoritativeRestore,
            Stop::Restored => StopWire::Restored,
            Stop::PushRefused(code) => StopWire::PushRefused { code },
            Stop::LowDisk { needed, free } => StopWire::LowDisk { needed, free },
            Stop::Error(message) => StopWire::Error { message },
        }
    }
}

#[derive(Serialize)]
struct HoldWire {
    lane: &'static str,
    seq: i64,
    reason: HoldReasonWire,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum HoldReasonWire {
    CorruptEnvelope,
    UpdateRequired,
}

impl From<Hold> for HoldWire {
    fn from(hold: Hold) -> HoldWire {
        HoldWire {
            lane: hold.lane.as_wire(),
            seq: hold.seq,
            reason: match hold.reason {
                HoldReason::CorruptEnvelope => HoldReasonWire::CorruptEnvelope,
                HoldReason::UpdateRequired => HoldReasonWire::UpdateRequired,
            },
        }
    }
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum EventWire {
    Changed { kinds: Vec<&'static str> },
    Status { status: StatusWire },
    Error { message: String },
    AttachmentsFetched { ids: Vec<String> },
}

impl From<Event> for EventWire {
    fn from(event: Event) -> EventWire {
        match event {
            Event::Changed { kinds } => EventWire::Changed {
                kinds: kinds.into_iter().map(|kind| kind.as_wire()).collect(),
            },
            Event::Status(status) => EventWire::Status { status: status.into() },
            Event::Error(message) => EventWire::Error { message },
            Event::AttachmentsFetched { ids } => EventWire::AttachmentsFetched { ids },
        }
    }
}

#[cfg(test)]
mod tests {
    use koloda::repo::sync::apply::{Hold, HoldReason};
    use koloda_sync_proto::registry::{Kind, Lane};
    use serde_json::json;

    use super::*;

    fn status(state: State) -> Status {
        Status {
            state,
            last_success_ms: Some(1_760_000_000_000),
            pending: 3,
            held: 0,
            uploads: 1,
            fetches: 2,
            lag_hot: Some(40),
            lag_cold: None,
            skew_ms: -250,
            hold: Some(Hold {
                lane: Lane::Cold,
                seq: 17,
                reason: HoldReason::CorruptEnvelope,
            }),
            is_over_quota: true,
            metered: None,
            push_resumes_at_ms: Some(1_760_000_060_000),
        }
    }

    #[test]
    fn status_crosses_with_its_state_hold_and_times() {
        let wire = serde_json::to_value(StatusWire::from(status(State::Syncing))).unwrap();

        assert_eq!(
            wire,
            json!({
                "state": { "type": "syncing" },
                "lastSuccessAt": 1_760_000_000_000_i64,
                "pending": 3,
                "held": 0,
                "uploads": 1,
                "fetches": 2,
                "lagHot": 40,
                "lagCold": null,
                "skewMs": -250,
                "hold": { "lane": "cold", "seq": 17, "reason": "corruptEnvelope" },
                "isOverQuota": true,
                "pushResumesAt": 1_760_000_060_000_i64,
            })
        );
    }

    #[test]
    fn each_stop_crosses_with_its_reason_and_fields() {
        let cases = [
            (Stop::ClockSkew, json!({ "reason": "clockSkew" })),
            (Stop::Revoked, json!({ "reason": "revoked" })),
            (Stop::UnknownDevice, json!({ "reason": "unknownDevice" })),
            (Stop::AuthoritativeRestore, json!({ "reason": "authoritativeRestore" })),
            (Stop::Restored, json!({ "reason": "restored" })),
            (
                Stop::PushRefused(ErrorCode::StampAhead),
                json!({ "reason": "pushRefused", "code": "stamp_ahead" }),
            ),
            (
                Stop::LowDisk { needed: 900, free: 100 },
                json!({ "reason": "lowDisk", "needed": 900, "free": 100 }),
            ),
            (
                Stop::Error("no reply".to_string()),
                json!({ "reason": "error", "message": "no reply" }),
            ),
        ];
        for (stop, expected) in cases {
            let wire = serde_json::to_value(StatusWire::from(status(State::Stopped(stop)))).unwrap();
            assert_eq!(wire["state"], json!({ "type": "stopped", "stop": expected }));
        }
    }

    #[test]
    fn events_cross_with_their_type_and_wire_kinds() {
        let changed = Event::Changed {
            kinds: vec![Kind::Cards, Kind::SettingsLearning],
        };
        assert_eq!(
            serde_json::to_value(EventWire::from(changed)).unwrap(),
            json!({ "type": "changed", "kinds": ["cards", "settings.learning"] })
        );
        let fetched = Event::AttachmentsFetched {
            ids: vec!["ab".to_string()],
        };
        assert_eq!(
            serde_json::to_value(EventWire::from(fetched)).unwrap(),
            json!({ "type": "attachmentsFetched", "ids": ["ab"] })
        );
    }

    #[test]
    fn a_file_in_no_space_does_not_run() {
        let cases = [
            (State::NotEnrolled, false),
            (State::Stopped(Stop::Revoked), false),
            (State::Stopped(Stop::Restored), false),
            (State::Stopped(Stop::UnknownDevice), true),
            (State::ImportPending, true),
            (State::Idle, true),
        ];
        for (state, expected) in cases {
            assert_eq!(is_in_space(&status(state.clone())), expected, "{state:?}");
        }
    }

    #[test]
    fn errors_cross_with_a_sync_code_and_local_errors_keep_theirs() {
        let server = |code| SyncError::Server {
            status: 401,
            code,
            message: String::new(),
        };
        let cases = [
            (SyncError::Transport("refused".to_string()), "sync.unreachable"),
            (server(ErrorCode::Unauthorized), "sync.unauthorized"),
            (server(ErrorCode::PairingFailed), "sync.pairing-failed"),
            (server(ErrorCode::RateLimited), "sync.rate-limited"),
            (server(ErrorCode::Internal), "sync.server"),
            (SyncError::Revoked, "sync.detached"),
            (SyncError::PairAgain, "sync.pair-again"),
            (
                SyncError::CannotJoin(JoinMode::AttachedElsewhere),
                "sync.attached-elsewhere",
            ),
            (SyncError::CannotJoin(JoinMode::Used), "sync.cannot-join"),
            (
                SyncError::InsecureServerUrl("http://example.test".to_string()),
                "sync.insecure-server-url",
            ),
            (SyncError::BudgetSpent, "sync.failed"),
            (SyncError::Local(AppError::new("keyring", None)), "keyring"),
        ];
        for (error, expected) in cases {
            assert_eq!(to_app_error(error).code, expected);
        }
    }
}
