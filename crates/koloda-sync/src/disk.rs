//! The free-disk preflight before a bootstrap applies its first page (`crates/koloda-sync-proto/PROTOCOL.md`
//! §Bootstrap).

use std::path::Path;
use std::sync::Arc;

use crate::bootstrap::Bootstrap;
use crate::engine::Shared;
use crate::error::SyncError;

// WHY: applied with their rows, registers, origins, indexes, and write-ahead log, a snapshot's envelopes grow the file
// by less than this many times their bytes; `disk_tests` pins it on fixture data.
const GROWTH: u64 = 3;
const MARGIN_BYTES: u64 = 64 * 1024 * 1024;

/// Reads the free space of the volume that holds a path; tests stand in their own.
pub trait FreeSpace: Send + Sync {
    /// Bytes this process may still write there, or `None` when the platform cannot tell.
    fn free_bytes(&self, path: &Path) -> Option<u64>;
}

pub struct SystemDisk;

impl FreeSpace for SystemDisk {
    fn free_bytes(&self, path: &Path) -> Option<u64> {
        fs4::available_space(path).ok()
    }
}

impl Shared {
    /// Fails when the volume that holds the database has no room for a snapshot of `bytes`. A re-bootstrap mostly
    /// rewrites rows the file holds, so it needs the file's current size less. An in-memory database, or a platform
    /// that cannot tell, passes.
    pub(crate) async fn check_disk(self: &Arc<Self>, kind: Bootstrap, bytes: u64) -> Result<(), SyncError> {
        let found = self
            .blocking(move |shared| {
                let Some(path) = shared.db.file_path()? else {
                    return Ok(None);
                };
                let held = match kind {
                    Bootstrap::Join => 0,
                    Bootstrap::Rebase => std::fs::metadata(&path).map_or(0, |file| file.len()),
                };
                Ok(shared.disk.free_bytes(&path).map(|free| (free, held)))
            })
            .await?;
        let Some((free, held)) = found else {
            return Ok(());
        };
        let needed = bytes
            .saturating_mul(GROWTH)
            .saturating_sub(held)
            .saturating_add(MARGIN_BYTES);
        if free < needed {
            return Err(SyncError::LowDisk { needed, free });
        }
        Ok(())
    }
}
