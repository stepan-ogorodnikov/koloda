//! Space quotas and disk watermarks (`PROTOCOL.md` §Quotas): while a space is over, growing writes are held and
//! bootstraps and uploads are refused; once the disk is down to its reserve, every push is refused.

use std::path::Path;
use std::sync::Arc;

use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::http::ApiError;
use crate::server::Server;

pub const DEFAULT_MIN_FREE_DISK: u64 = 1 << 30;
pub const DEFAULT_RESERVE_DISK: u64 = 64 << 20;

/// Free bytes on the volume that holds a path, or `None` where this platform cannot tell.
pub trait FreeSpace: Send + Sync {
    fn free_bytes(&self, path: &Path) -> Option<u64>;
}

/// The data directory's volume, as `statvfs` reports it to an unprivileged process.
pub struct VolumeFreeSpace;

impl FreeSpace for VolumeFreeSpace {
    #[cfg(unix)]
    fn free_bytes(&self, path: &Path) -> Option<u64> {
        // WHY: a volume that cannot report its free space counts as having room; space quotas still apply.
        let stat = rustix::fs::statvfs(path).ok()?;
        Some(stat.f_bavail.saturating_mul(stat.f_frsize))
    }

    #[cfg(not(unix))]
    fn free_bytes(&self, _path: &Path) -> Option<u64> {
        None
    }
}

/// The disk watermarks `serve` enforces. Zero turns a watermark off, as the default does for every other caller.
pub struct Storage {
    /// Below this many free bytes, growing writes are held as if every space were over its quota.
    pub min_free_disk: u64,
    /// Below this many free bytes, every push is refused before anything is consumed or fenced.
    pub reserve_disk: u64,
    pub free_space: Arc<dyn FreeSpace>,
    /// Caps each space file at this many pages, or at its size when it opens if that is larger, so a write past it
    /// fails as on a full disk. Zero, the default, leaves the files uncapped; `serve` has no flag for it.
    pub max_space_pages: u64,
}

impl Default for Storage {
    fn default() -> Storage {
        Storage {
            min_free_disk: 0,
            reserve_disk: 0,
            free_space: Arc::new(VolumeFreeSpace),
            max_space_pages: 0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Room {
    Free,
    /// Over the space's quota or below the soft watermark: growing writes are held, tombstones still apply.
    Over,
    /// Below the reserve: nothing is pushed until the operator frees disk.
    Full,
}

impl Server {
    /// Sets the space's quota in bytes, or removes it; `koloda-server quota` runs it beside `serve`.
    pub fn set_quota(&self, space: Uuid, quota_bytes: Option<u64>) -> Result<(), ApiError> {
        let changed = self.server_db()?.execute(
            "UPDATE spaces SET quota_bytes = ?1 WHERE id = ?2",
            params![quota_bytes, space],
        )?;
        if changed == 0 {
            return Err(ApiError::unknown_space());
        }
        Ok(())
    }

    /// The space's quota, read before its space lock is taken.
    pub(crate) fn quota(&self, space: Uuid) -> Result<Option<u64>, ApiError> {
        Ok(self
            .server_db()?
            .query_row("SELECT quota_bytes FROM spaces WHERE id = ?1", params![space], |row| {
                row.get::<_, Option<u64>>(0)
            })
            .optional()?
            .flatten())
    }

    /// How much room a space has: the volume's free space against the watermarks, then its usage against `quota`.
    pub(crate) fn room(&self, conn: &Connection, quota: Option<u64>) -> Result<Room, ApiError> {
        let storage = self.storage();
        if storage.reserve_disk > 0 || storage.min_free_disk > 0 {
            if let Some(free) = storage.free_space.free_bytes(self.generation()) {
                if free < storage.reserve_disk {
                    return Ok(Room::Full);
                }
                if free < storage.min_free_disk {
                    return Ok(Room::Over);
                }
            }
        }
        match quota {
            Some(quota) if usage(conn)? >= quota => Ok(Room::Over),
            _ => Ok(Room::Free),
        }
    }
}

/// The space's pages in use plus the bytes of its stored attachments.
///
/// WHY: pages, not row bytes, so the count costs no scan of the log and follows what the file holds on disk. A
/// delete lowers it once its transaction frees whole pages. The attachment total is kept by triggers
/// (`V5__attachment_bytes.sql`), so it costs no scan either.
fn usage(conn: &Connection) -> Result<u64, ApiError> {
    let pages: u64 = conn.query_row(
        "SELECT (SELECT page_count FROM pragma_page_count()) - (SELECT freelist_count FROM pragma_freelist_count())",
        [],
        |row| row.get(0),
    )?;
    let page_size: u64 = conn.query_row("SELECT page_size FROM pragma_page_size()", [], |row| row.get(0))?;
    let attachments: u64 = conn.query_row("SELECT attachment_bytes FROM space WHERE id = 1", [], |row| row.get(0))?;
    Ok(pages.saturating_mul(page_size).saturating_add(attachments))
}
