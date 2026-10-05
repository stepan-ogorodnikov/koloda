//! The host's handle on sync. It owns a tokio runtime; every host call blocks on it until the work is done.

use std::sync::Arc;

use koloda::app::db::Database;
use koloda::app::error::{error_codes, AppError};
use koloda::app::secrets::SecretStore;
use koloda::repo::sync::{enroll_device, enrolled_device, SpaceRole};
use koloda_sync_proto::transport::{CreateSpace, Enrollment, Platform};
use tokio::runtime::Runtime;
use uuid::Uuid;

use crate::client::{server_url, Client, Skew};
use crate::error::SyncError;
use crate::transport::{Method, Transport};

const RUNTIME_THREAD: &str = "koloda-sync";

pub struct Engine {
    runtime: Runtime,
    shared: Arc<Shared>,
}

struct Shared {
    db: Database,
    secrets: Arc<dyn SecretStore>,
    transport: Arc<dyn Transport>,
    platform: Platform,
    skew: Skew,
}

impl Engine {
    pub fn start(
        db: Database,
        secrets: Arc<dyn SecretStore>,
        transport: Arc<dyn Transport>,
        platform: Platform,
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
        let shared = Arc::clone(&self.shared);
        self.runtime
            .block_on(shared.create_space(server_url, setup_token, space_name, device_name))
    }

    /// Server time minus local time when the last reply arrived, in milliseconds.
    pub fn skew_ms(&self) -> i64 {
        self.shared.skew.get()
    }
}

impl Shared {
    fn client<'a>(&'a self, base: &'a str) -> Client<'a> {
        Client {
            base,
            transport: self.transport.as_ref(),
            skew: &self.skew,
        }
    }

    // INVARIANT: `Database` serializes every call on one mutex, so database and secret-store work runs on blocking
    // threads and never stalls the runtime's worker.
    async fn blocking<T, F>(self: &Arc<Self>, work: F) -> Result<T, SyncError>
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
            .await?;

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

fn token_key(device: Uuid) -> String {
    format!("sync.token.{device}")
}
