//! The host's handle on sync. It owns a tokio runtime; every host call blocks on it until the work is done, and the
//! background runner lives on it.

use std::future::Future;
use std::sync::{Arc, Mutex, MutexGuard};

use koloda::app::db::Database;
use koloda::app::error::{error_codes, AppError};
use koloda::app::init::SeedSettings;
use koloda::app::secrets::SecretStore;
use koloda::app::utility::get_current_timestamp;
use koloda::repo::sync::apply::Hold;
use koloda::repo::sync::repair::Starter;
use koloda::repo::sync::restamp::pause_clock;
use koloda::repo::sync::{enroll_device, enrolled_device, sync_state, SpaceRole};
use koloda_sync_proto::registry::{Kind, Lane};
use koloda_sync_proto::transport::{CreateSpace, Enrollment, ErrorCode, Platform};
use tokio::runtime::Runtime;
use uuid::Uuid;

use crate::client::{server_url, Client, Skew};
use crate::devices::DeviceSummary;
use crate::error::SyncError;
use crate::pairing::{ImportMode, IssuedPairing, Joined, Preview};
use crate::runner::{Budget, Event, EventSink, Spending, Ticked, Timer, Triggers};
use crate::status::{RunState, Status, Stop};
use crate::transport::{Method, Transport};

const RUNTIME_THREAD: &str = "koloda-sync";
// WHY: each restore the server reports is one more operator action; a cycle that keeps meeting new ones stops and
// the next trigger resumes.
const MAX_RESTORES: usize = 3;

pub struct Engine {
    runtime: Runtime,
    shared: Arc<Shared>,
}

pub(crate) struct Shared {
    pub(crate) db: Database,
    pub(crate) secrets: Arc<dyn SecretStore>,
    transport: Arc<dyn Transport>,
    pub(crate) platform: Platform,
    pub(crate) starter: Starter,
    pub(crate) skew: Skew,
    // INVARIANT: one cycle runs at a time, whether the runner, `sync_now`, or `tick` started it.
    cycle: tokio::sync::Mutex<()>,
    pub(crate) triggers: Triggers,
    run_state: Mutex<RunState>,
    sink: Mutex<Option<Arc<dyn EventSink>>>,
    spending: Mutex<Option<Spending>>,
}

/// What every call to the enrolled space needs, read once per cycle.
pub(crate) struct Session {
    pub(crate) base: String,
    pub(crate) space: Uuid,
    pub(crate) device: Uuid,
    pub(crate) token: String,
    /// The space's epoch the file last saw; every device call names it.
    pub(crate) epoch: Uuid,
}

impl Engine {
    pub fn start(
        db: Database,
        secrets: Arc<dyn SecretStore>,
        transport: Arc<dyn Transport>,
        platform: Platform,
        starter: Starter,
    ) -> Result<Engine, SyncError> {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .thread_name(RUNTIME_THREAD)
            .enable_all()
            .build()
            .map_err(AppError::from)?;
        Ok(Engine {
            runtime,
            shared: Arc::new(Shared {
                db,
                secrets,
                transport,
                platform,
                starter,
                skew: Skew::default(),
                cycle: tokio::sync::Mutex::new(()),
                triggers: Triggers::default(),
                run_state: Mutex::new(RunState::default()),
                sink: Mutex::new(None),
                spending: Mutex::new(None),
            }),
        })
    }

    /// Starts the background runner: a cycle now, then one per trigger and per poll. Events go to `sink`.
    pub fn start_runner(&self, sink: Arc<dyn EventSink>, timer: Arc<dyn Timer>) -> Result<(), SyncError> {
        *self.shared.lock(&self.shared.sink)? = Some(sink);
        let shared = Arc::clone(&self.shared);
        self.runtime.spawn(shared.run_forever(timer));
        Ok(())
    }

    /// A local commit happened; the runner syncs once the commits of the next 300 ms have joined it.
    pub fn notify_local_change(&self) {
        self.shared.triggers.fire(true);
    }

    /// The app came to the foreground or the network came back; the runner syncs now.
    pub fn nudge(&self) {
        self.shared.triggers.fire(false);
    }

    /// Creates a space on the server and enrolls this file as its creator.
    pub fn create_space(
        &self,
        server_url: &str,
        setup_token: &str,
        space_name: &str,
        device_name: &str,
    ) -> Result<(), SyncError> {
        self.run(|shared| shared.create_space(server_url, setup_token, space_name, device_name))
    }

    /// Runs the sync cycle and returns the kinds whose product rows it changed.
    pub fn sync_now(&self) -> Result<Vec<Kind>, SyncError> {
        self.run(|shared| async move {
            let (changed, result) = shared.run_cycle(None).await;
            result.map(|()| changed)
        })
    }

    /// Runs one cycle within `budget`; the next tick resumes from the cursors.
    pub fn tick(&self, budget: Budget) -> Result<Ticked, SyncError> {
        self.run(|shared| async move {
            match shared.run_cycle(Some(budget)).await {
                (changed, Ok(())) => Ok(Ticked { changed, is_done: true }),
                (changed, Err(SyncError::BudgetSpent)) => Ok(Ticked {
                    changed,
                    is_done: false,
                }),
                (_, Err(error)) => Err(error),
            }
        })
    }

    pub fn status(&self) -> Result<Status, SyncError> {
        self.run(|shared| async move { shared.status().await })
    }

    /// Issues a pairing code for this file's space; `hint` is opaque bytes the joining device receives.
    pub fn issue_pairing(&self, hint: Option<Vec<u8>>) -> Result<IssuedPairing, SyncError> {
        self.run(|shared| shared.issue_pairing(hint))
    }

    /// Shows what a code would join, without using it.
    pub fn preview(&self, server_url: &str, code: &str) -> Result<Preview, SyncError> {
        self.run(|shared| shared.preview(server_url, code))
    }

    /// Joins the space a code names; the next cycle bootstraps the file. `settings` seed a blank file.
    pub fn join(
        &self,
        server_url: &str,
        code: &str,
        device_name: &str,
        settings: SeedSettings,
    ) -> Result<Joined, SyncError> {
        self.run(|shared| shared.join(server_url, code, device_name, settings))
    }

    /// Finishes a used file's join by Add or Replace.
    pub fn import(&self, mode: ImportMode) -> Result<(), SyncError> {
        self.run(|shared| shared.import(mode))
    }

    /// The space's devices, this file's own marked.
    pub fn devices(&self) -> Result<Vec<DeviceSummary>, SyncError> {
        self.run(|shared| async move { shared.devices().await })
    }

    /// Revokes another device of the space.
    pub fn revoke_device(&self, device: Uuid) -> Result<(), SyncError> {
        self.run(|shared| async move { shared.revoke_device(device).await })
    }

    /// Accepts a held authoritative restore: the file discards its product rows and sync tables, keeps its settings,
    /// conversations, and images, and bootstraps from the restored space.
    pub fn accept_restore(&self) -> Result<(), SyncError> {
        self.run(|shared| shared.accept_restore())
    }

    /// Revokes this file's own device and detaches the file.
    pub fn detach(&self) -> Result<(), SyncError> {
        self.run(|shared| async move { shared.detach().await })
    }

    /// Server time minus local time when the last reply arrived, in milliseconds.
    pub fn skew_ms(&self) -> i64 {
        self.shared.skew.get()
    }

    fn run<T, F>(&self, work: impl FnOnce(Arc<Shared>) -> F) -> Result<T, SyncError>
    where
        F: Future<Output = Result<T, SyncError>>,
    {
        let shared = Arc::clone(&self.shared);
        self.runtime.block_on(async move {
            let result = work(Arc::clone(&shared)).await;
            shared.settle_device(result).await
        })
    }
}

impl Shared {
    pub(crate) fn client<'a>(&'a self, base: &'a str) -> Client<'a> {
        Client {
            base,
            transport: self.transport.as_ref(),
            skew: &self.skew,
            spending: None,
            epoch: None,
        }
    }

    /// A client for calls made with the session's device token, which name the epoch the file last saw.
    pub(crate) fn device_client<'a>(&'a self, session: &'a Session) -> Client<'a> {
        Client {
            epoch: Some(session.epoch),
            ..self.client(&session.base)
        }
    }

    /// A device client whose requests spend the running tick's budget; only the cycle uses it, so host calls made
    /// during a tick are not limited by it.
    pub(crate) fn cycle_client<'a>(&'a self, session: &'a Session) -> Client<'a> {
        Client {
            spending: Some(&self.spending),
            ..self.device_client(session)
        }
    }

    // INVARIANT: `Database` serializes every call on one mutex, so database and secret-store work runs on blocking
    // threads and never stalls the runtime's worker.
    pub(crate) async fn blocking<T, F>(self: &Arc<Self>, work: F) -> Result<T, SyncError>
    where
        T: Send + 'static,
        F: FnOnce(&Shared) -> Result<T, AppError> + Send + 'static,
    {
        let shared = Arc::clone(self);
        tokio::task::spawn_blocking(move || work(&shared))
            .await
            .map_err(|error| AppError::new(error_codes::UNKNOWN, Some(error.to_string())))?
            .map_err(SyncError::Local)
    }

    // INVARIANT: a `401 revoked` reply to any call detaches the file, which then sends nothing more
    // (PROTOCOL.md, Devices). A restore a host call ran into is applied, so the next call names the new epoch.
    async fn settle_device<T>(self: &Arc<Self>, result: Result<T, SyncError>) -> Result<T, SyncError> {
        match result {
            Err(SyncError::Restored {
                restore,
                last_sender_seq,
            }) => {
                self.apply_restore(restore.clone(), last_sender_seq).await?;
                Err(SyncError::Restored {
                    restore,
                    last_sender_seq,
                })
            }
            Err(SyncError::Server {
                code: ErrorCode::Revoked,
                ..
            }) => {
                self.detach_locally().await?;
                Err(SyncError::Revoked)
            }
            // WHY: a cycle is settled once inside its host call and once more around it; the file detaches once.
            Err(SyncError::PairAgain) => {
                let is_detached = self
                    .blocking(|shared| sync_state(&shared.db))
                    .await?
                    .is_some_and(|state| state.is_detached);
                if !is_detached {
                    self.detach_locally().await?;
                }
                Err(SyncError::PairAgain)
            }
            Err(SyncError::Server {
                code: ErrorCode::UnknownDevice,
                ..
            }) => Err(SyncError::UnknownDevice),
            result => result,
        }
    }

    /// Runs one cycle under the cycle lock, records how it ended, and tells the host. The kinds changed before an
    /// error still come back, since their rows changed all the same.
    pub(crate) async fn run_cycle(self: &Arc<Self>, budget: Option<Budget>) -> (Vec<Kind>, Result<(), SyncError>) {
        let _cycle = self.cycle.lock().await;
        let mut changed = Vec::new();
        let result = self.recorded_cycle(budget, &mut changed).await;
        if !changed.is_empty() {
            self.emit(Event::Changed { kinds: changed.clone() });
        }
        if let Err(error) = &result {
            if !matches!(error, SyncError::BudgetSpent) {
                self.emit(Event::Error(error.to_string()));
            }
        }
        self.emit_status().await;
        (changed, result)
    }

    async fn recorded_cycle(
        self: &Arc<Self>,
        budget: Option<Budget>,
        changed: &mut Vec<Kind>,
    ) -> Result<(), SyncError> {
        *self.lock(&self.spending)? = budget.map(Spending::new);
        self.lock(&self.run_state)?.is_syncing = true;
        self.emit_status().await;

        let synced = self.sync(changed).await;
        let result = self.settle_device(synced).await;

        *self.lock(&self.spending)? = None;
        let mut run = self.lock(&self.run_state)?;
        run.is_syncing = false;
        match &result {
            Ok(()) => {
                run.stop = None;
                run.last_success_ms = get_current_timestamp().ok();
            }
            // WHY: a spent budget is the host's limit, not a fault; the next tick picks up from the cursors.
            Err(SyncError::BudgetSpent) => {}
            // WHY: a held bootstrap is waiting, not stopped; the status shows the hold beside the bootstrap state.
            Err(SyncError::Held(_)) => run.stop = None,
            Err(error) => run.stop = Some(Stop::of(error)),
        }
        result
    }

    async fn sync(self: &Arc<Self>, changed: &mut Vec<Kind>) -> Result<(), SyncError> {
        let mut session = self.session().await?;
        let mut result = self.cycle(&mut session, changed).await;
        // INVARIANT: a restore is applied before the file sends anything else on the new epoch; the cycle then starts
        // again. A second restore while it runs is applied the same way (PROTOCOL.md, Server restore).
        for _ in 0..MAX_RESTORES {
            let Err(SyncError::Restored {
                restore,
                last_sender_seq,
            }) = result
            else {
                break;
            };
            session.epoch = self.apply_restore(restore, last_sender_seq).await?;
            result = self.cycle(&mut session, changed).await;
        }
        // INVARIANT: the pause outlives a relaunch, so the writes captured on a wrong clock take new stamps before the
        // next cycle pushes or applies anything (PROTOCOL.md, Skew guards).
        if matches!(result, Err(SyncError::ClockSkew { .. })) {
            self.blocking(|shared| pause_clock(&shared.db)).await?;
        }
        // WHY: transfers carry no stamps, so they run while push and apply pause for the clock (PROTOCOL.md, Cycle).
        let result = match result {
            Ok(()) => self.check_missing_attachments(&session).await,
            other => other,
        };
        let transferred = match &result {
            Ok(()) | Err(SyncError::ClockSkew { .. }) => self.transfer(&session).await,
            Err(_) => Ok(false),
        };
        match (result, transferred) {
            (Err(error), _) | (Ok(()), Err(error)) => Err(error),
            (Ok(()), Ok(is_pending)) => {
                if is_pending {
                    self.triggers.fire(false);
                }
                Ok(())
            }
        }
    }

    pub(crate) fn emit(&self, event: Event) {
        if let Ok(sink) = self.lock(&self.sink) {
            if let Some(sink) = sink.as_ref() {
                sink.send(event);
            }
        }
    }

    async fn emit_status(self: &Arc<Self>) {
        if self.lock(&self.sink).is_ok_and(|sink| sink.is_none()) {
            return;
        }
        match self.status().await {
            Ok(status) => self.emit(Event::Status(status)),
            Err(error) => self.emit(Event::Error(error.to_string())),
        }
    }

    pub(crate) fn run_state(&self) -> Result<RunState, SyncError> {
        Ok(self.lock(&self.run_state)?.clone())
    }

    pub(crate) fn note_heads(&self, head_hot: u64, head_cold: u64) -> Result<(), SyncError> {
        self.lock(&self.run_state)?.heads = Some((head_hot, head_cold));
        Ok(())
    }

    /// Records the entry a lane stopped at, or clears that lane's hold once a pull of it passes the entry.
    pub(crate) fn note_hold(&self, lane: Lane, hold: Option<Hold>) -> Result<(), SyncError> {
        let mut run = self.lock(&self.run_state)?;
        if hold.is_some() || run.hold.is_some_and(|held| held.lane == lane) {
            run.hold = hold;
        }
        Ok(())
    }

    /// Fails once a tick's wall time is spent; checked before each page apply.
    pub(crate) fn check_time(&self) -> Result<(), SyncError> {
        match self.lock(&self.spending)?.as_ref() {
            Some(spending) => spending.check_time(),
            None => Ok(()),
        }
    }

    pub(crate) fn spend_bytes(&self, bytes: usize) -> Result<(), SyncError> {
        if let Some(spending) = self.lock(&self.spending)?.as_mut() {
            spending.spend(bytes);
        }
        Ok(())
    }

    pub(crate) fn lock<'a, T>(&self, mutex: &'a Mutex<T>) -> Result<MutexGuard<'a, T>, SyncError> {
        mutex
            .lock()
            .map_err(|error| SyncError::Local(AppError::new(error_codes::UNKNOWN, Some(error.to_string()))))
    }

    pub(crate) async fn session(self: &Arc<Self>) -> Result<Session, SyncError> {
        let (state, token) = self
            .blocking(|shared| {
                let Some(state) = sync_state(&shared.db)? else {
                    return Ok(None);
                };
                let token = shared.secrets.get(&token_key(state.device_id))?;
                Ok(Some((state, token)))
            })
            .await?
            .ok_or(SyncError::NotEnrolled)?;
        if state.is_detached {
            return Err(SyncError::Detached);
        }
        let (Some(base), Some(token), Some(epoch)) = (state.server_url, token, state.epoch) else {
            return Err(SyncError::NotEnrolled);
        };
        Ok(Session {
            base,
            space: state.space_id,
            device: state.device_id,
            token,
            epoch,
        })
    }

    async fn create_space(
        self: Arc<Self>,
        server_url_text: &str,
        setup_token: &str,
        space_name: &str,
        device_name: &str,
    ) -> Result<(), SyncError> {
        let base = server_url(server_url_text)?;
        if self.blocking(|shared| enrolled_device(&shared.db)).await?.is_some() {
            return Err(SyncError::AlreadyEnrolled);
        }

        // INVARIANT: retries inside `call` resend the same nonce, so a lost reply still ends in one space.
        let request = CreateSpace {
            name: space_name.to_string(),
            device_name: device_name.to_string(),
            platform: self.platform,
            nonce: Uuid::new_v4().into_bytes(),
        };
        let enrollment: Enrollment = self
            .client(&base)
            .call(Method::Post, "/v1/spaces", Some(setup_token), Some(&request))
            .await?
            .ok;

        self.blocking(move |shared| {
            let device = Uuid::from_bytes(enrollment.device_id);
            shared.secrets.set(&token_key(device), &enrollment.token)?;
            enroll_device(
                &shared.db,
                device,
                Uuid::from_bytes(enrollment.space_id),
                SpaceRole::Creator,
                Uuid::from_bytes(enrollment.epoch),
                &base,
            )
        })
        .await
    }
}

/// Adds kinds not already listed, keeping first-changed order.
pub(crate) fn merge(changed: &mut Vec<Kind>, kinds: Vec<Kind>) {
    for kind in kinds {
        if !changed.contains(&kind) {
            changed.push(kind);
        }
    }
}

pub(crate) fn token_key(device: Uuid) -> String {
    format!("sync.token.{device}")
}
