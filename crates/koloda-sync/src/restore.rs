//! A server restore seen from the device: heal re-pushes what the restored server lacks, and an authoritative
//! restore discards local data once the host accepts it (`crates/koloda-sync-proto/PROTOCOL.md` §Server restore).

use std::sync::Arc;

use koloda::repo::sync::authoritative::{hold_authoritative, reset_for_authoritative};
use koloda::repo::sync::heal::begin_heal;
use koloda_sync_proto::transport::{Restore, RestoreMode};
use serde::de::DeserializeOwned;
use uuid::Uuid;

use crate::engine::{Session, Shared};
use crate::error::SyncError;
use crate::transport::Method;

impl Shared {
    /// Applies a restore the server reported and returns the epoch the file is on now. An authoritative restore is
    /// only recorded: the file then waits for the host, and the call fails with `RestoreHeld`.
    pub(crate) async fn apply_restore(
        self: &Arc<Self>,
        restore: Restore,
        last_sender_seq: u64,
    ) -> Result<Uuid, SyncError> {
        let epoch = Uuid::from_bytes(restore.epoch);
        match restore.mode {
            RestoreMode::Heal => {
                let cutoffs: Vec<(Uuid, u64)> = restore
                    .cutoffs
                    .iter()
                    .map(|cutoff| (Uuid::from_bytes(cutoff.sender), cutoff.last_seq))
                    .collect();
                let (head_hot, head_cold) = (restore.head_hot, restore.head_cold);
                self.blocking(move |shared| begin_heal(&shared.db, epoch, head_hot, head_cold, &cutoffs))
                    .await?;
                Ok(epoch)
            }
            // INVARIANT: nothing is deleted before the host accepts; the record outlives a relaunch.
            RestoreMode::Authoritative => {
                self.blocking(move |shared| hold_authoritative(&shared.db, epoch, last_sender_seq))
                    .await?;
                Err(SyncError::RestoreHeld)
            }
        }
    }

    /// One device call that a re-attach or a detach makes across server restores. A `Restored` answer is applied, the
    /// session moves to that epoch, and the call is repeated. An authoritative restore is held and the call still
    /// repeats, so the switch or the revoke can finish.
    pub(crate) async fn call_across_restore<T: DeserializeOwned>(
        self: &Arc<Self>,
        session: &mut Session,
        method: Method,
        path: &str,
    ) -> Result<T, SyncError> {
        loop {
            match self
                .device_client(session)
                .call::<(), T>(method, path, Some(&session.token), None)
                .await
            {
                Ok(reply) => return Ok(reply.ok),
                Err(SyncError::Restored {
                    restore,
                    last_sender_seq,
                }) => {
                    let epoch = Uuid::from_bytes(restore.epoch);
                    match self.apply_restore(restore, last_sender_seq).await {
                        Ok(_) | Err(SyncError::RestoreHeld) => session.epoch = epoch,
                        Err(error) => return Err(error),
                    }
                }
                Err(error) => return Err(error),
            }
        }
    }

    /// Discards the file's product rows and sync tables for a held authoritative restore; the next cycle bootstraps
    /// the file from the restored space.
    pub(crate) async fn accept_restore(self: Arc<Self>) -> Result<(), SyncError> {
        self.blocking(|shared| reset_for_authoritative(&shared.db)).await?;
        self.triggers.fire(false);
        Ok(())
    }
}
