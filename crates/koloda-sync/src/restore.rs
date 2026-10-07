//! A server restore seen from the device: heal re-pushes what the restored server lacks
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Server restore).

use std::sync::Arc;

use koloda::repo::sync::heal::begin_heal;
use koloda_sync_proto::transport::{Restore, RestoreMode};
use uuid::Uuid;

use crate::engine::Shared;
use crate::error::SyncError;

impl Shared {
    /// Applies a restore the server reported and returns the epoch the file is on now.
    pub(crate) async fn apply_restore(self: &Arc<Self>, restore: Restore) -> Result<Uuid, SyncError> {
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
            RestoreMode::Authoritative => Err(SyncError::Restored(restore)),
        }
    }
}
