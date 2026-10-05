//! The host's handle on sync. It owns a tokio runtime; every host call blocks on it until the work is done.

use std::future::Future;
use std::sync::Arc;

use koloda::app::db::Database;
use koloda::app::error::{error_codes, AppError};
use koloda::app::init::SeedSettings;
use koloda::app::secrets::SecretStore;
use koloda::repo::sync::repair::Starter;
use koloda::repo::sync::{enroll_device, enrolled_device, sync_state, SpaceRole};
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::{CreateSpace, Enrollment, ErrorCode, Platform};
use tokio::runtime::Runtime;
use uuid::Uuid;

use crate::client::{server_url, Client, Skew};
use crate::devices::DeviceSummary;
use crate::error::SyncError;
use crate::pairing::{ImportMode, IssuedPairing, Joined, Preview};
use crate::transport::{Method, Transport};

const RUNTIME_THREAD: &str = "koloda-sync";

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
}

/// What every call to the enrolled space needs, read once per cycle.
pub(crate) struct Session {
    pub(crate) base: String,
    pub(crate) space: Uuid,
    pub(crate) device: Uuid,
    pub(crate) token: String,
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
            }),
        })
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
        self.run(|shared| shared.sync())
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

    /// Revokes this file's own device and detaches the file.
    pub fn detach(&self) -> Result<(), SyncError> {
        self.run(|shared| async move { shared.detach().await })
    }

    /// Server time minus local time when the last reply arrived, in milliseconds.
    pub fn skew_ms(&self) -> i64 {
        self.shared.skew.get()
    }
}

impl Engine {
    // INVARIANT: a `401 revoked` reply to any call detaches the file, which then sends nothing more
    // (PROTOCOL.md, Devices).
    fn run<T, F>(&self, work: impl FnOnce(Arc<Shared>) -> F) -> Result<T, SyncError>
    where
        F: Future<Output = Result<T, SyncError>>,
    {
        let shared = Arc::clone(&self.shared);
        self.runtime.block_on(async move {
            match work(Arc::clone(&shared)).await {
                Err(SyncError::Server {
                    code: ErrorCode::Revoked,
                    ..
                }) => {
                    shared.detach_locally().await?;
                    Err(SyncError::Revoked)
                }
                Err(SyncError::Server {
                    code: ErrorCode::UnknownDevice,
                    ..
                }) => Err(SyncError::UnknownDevice),
                result => result,
            }
        })
    }
}

impl Shared {
    pub(crate) fn client<'a>(&'a self, base: &'a str) -> Client<'a> {
        Client {
            base,
            transport: self.transport.as_ref(),
            skew: &self.skew,
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

    async fn sync(self: Arc<Self>) -> Result<Vec<Kind>, SyncError> {
        let session = self.session().await?;
        let mut changed = Vec::new();
        self.cycle(&session, &mut changed).await?;
        Ok(changed)
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
        let (Some(base), Some(token)) = (state.server_url, token) else {
            return Err(SyncError::NotEnrolled);
        };
        Ok(Session {
            base,
            space: state.space_id,
            device: state.device_id,
            token,
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
