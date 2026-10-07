//! Devices in the space: the list, revoking another device, and detaching this file
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Devices).

use std::sync::Arc;

use koloda::app::utility::get_current_timestamp;
use koloda::repo::sync::detach;
use koloda_sync_proto::transport::{DeviceList, Empty, ErrorCode, Platform};
use uuid::Uuid;

use crate::engine::{token_key, Shared};
use crate::error::SyncError;
use crate::transport::Method;

/// One device of the space as the server records it; `is_self` marks this file's own device.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeviceSummary {
    pub id: Uuid,
    pub name: String,
    pub platform: Platform,
    pub created_at: u64,
    pub last_seen: u64,
    pub revoked_at: Option<u64>,
    pub is_self: bool,
}

impl Shared {
    pub(crate) async fn devices(self: &Arc<Self>) -> Result<Vec<DeviceSummary>, SyncError> {
        let session = self.session().await?;
        let list: DeviceList = self
            .device_client(&session)
            .call::<(), _>(
                Method::Get,
                &format!("/v1/spaces/{}/devices", session.space),
                Some(&session.token),
                None,
            )
            .await?
            .ok;
        Ok(list
            .devices
            .into_iter()
            .map(|device| DeviceSummary {
                id: Uuid::from_bytes(device.id),
                name: device.name,
                platform: device.platform,
                created_at: device.created_at,
                last_seen: device.last_seen,
                revoked_at: device.revoked_at,
                is_self: device.id == *session.device.as_bytes(),
            })
            .collect())
    }

    pub(crate) async fn revoke_device(self: &Arc<Self>, device: Uuid) -> Result<(), SyncError> {
        let session = self.session().await?;
        self.device_client(&session)
            .call::<(), Empty>(
                Method::Delete,
                &format!("/v1/spaces/{}/devices/{device}", session.space),
                Some(&session.token),
                None,
            )
            .await?;
        Ok(())
    }

    /// Revokes this file's own device, then detaches the file.
    pub(crate) async fn detach(self: &Arc<Self>) -> Result<(), SyncError> {
        let session = self.session().await?;
        let revoked = self
            .device_client(&session)
            .call::<(), Empty>(
                Method::Delete,
                &format!("/v1/spaces/{}/devices/{}", session.space, session.device),
                Some(&session.token),
                None,
            )
            .await;
        match revoked {
            // WHY: a device another one revoked first is detached all the same.
            Ok(_)
            | Err(SyncError::Server {
                code: ErrorCode::Revoked,
                ..
            }) => self.detach_locally().await,
            Err(error) => Err(error),
        }
    }

    /// Forgets the token and marks the file detached; rows and sync tables stay for a later re-attach.
    pub(crate) async fn detach_locally(self: &Arc<Self>) -> Result<(), SyncError> {
        let session = self.session().await?;
        self.blocking(move |shared| {
            shared.secrets.remove(&token_key(session.device))?;
            detach(&shared.db, get_current_timestamp()?)
        })
        .await
    }
}
