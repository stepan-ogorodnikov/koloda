//! Bulk transfers on a metered network: which pause before they start, which count against an allowance as they run,
//! and the host's call that lifts both (`crates/koloda-sync-proto/PROTOCOL.md` §Metered networks).
//!
//! A `hot` pull, and a push of an outbox under the limit, are never bulk.

use std::sync::Arc;

use koloda::repo::sync::outbox::pending_bytes;

use crate::engine::Shared;
use crate::error::SyncError;

pub const DEFAULT_BULK_LIMIT_BYTES: u64 = 20_000_000;

/// The network the host reports.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Network {
    /// A metered network, or one in a low-data mode.
    pub is_metered: bool,
    /// What bulk transfers may move on a metered network before they pause.
    pub bulk_limit_bytes: u64,
}

impl Default for Network {
    fn default() -> Network {
        Network {
            is_metered: false,
            bulk_limit_bytes: DEFAULT_BULK_LIMIT_BYTES,
        }
    }
}

/// Bulk work that waits on a metered network until the host allows it or reports another network.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MeteredPause {
    /// What the waiting work would move, when that is known before it starts: a bootstrap's lease, or the outbox.
    pub estimate_bytes: Option<u64>,
}

/// What bulk work did on the network the host last reported.
#[derive(Default)]
pub(crate) struct Metered {
    network: Network,
    is_allowed: bool,
    /// Bytes the counted bulk work moved on this network.
    spent: u64,
    /// The estimate of a bootstrap that paused, so later cycles pause again without opening another lease.
    bootstrap: Option<u64>,
    /// The outbox's bytes when the last push check held it.
    outbox: Option<u64>,
    /// Counted bulk work stopped with work left once the allowance was spent.
    is_held: bool,
}

impl Metered {
    fn is_free(&self) -> bool {
        !self.network.is_metered || self.is_allowed
    }

    fn has_room(&self) -> bool {
        self.is_free() || self.spent < self.network.bulk_limit_bytes
    }
}

impl Shared {
    /// Takes the network the host reports; another network than the last lifts every pause and starts over.
    pub(crate) fn set_network(&self, network: Network) -> Result<(), SyncError> {
        let mut metered = self.lock(&self.metered)?;
        if metered.network == network {
            return Ok(());
        }
        *metered = Metered {
            network,
            ..Metered::default()
        };
        drop(metered);
        self.triggers.fire(false);
        Ok(())
    }

    /// Lifts every pause until the host reports another network.
    pub(crate) fn allow_metered(&self) -> Result<(), SyncError> {
        let mut metered = self.lock(&self.metered)?;
        metered.is_allowed = true;
        metered.bootstrap = None;
        metered.outbox = None;
        metered.is_held = false;
        drop(metered);
        self.triggers.fire(false);
        Ok(())
    }

    pub(crate) fn metered_pause(&self) -> Result<Option<MeteredPause>, SyncError> {
        let metered = self.lock(&self.metered)?;
        if metered.is_free() {
            return Ok(None);
        }
        Ok(match metered.bootstrap.or(metered.outbox) {
            Some(estimate) => Some(MeteredPause {
                estimate_bytes: Some(estimate),
            }),
            None if metered.is_held => Some(MeteredPause { estimate_bytes: None }),
            None => None,
        })
    }

    /// Fails while a bootstrap that paused still waits, before another lease opens to learn the same estimate.
    pub(crate) fn check_paused_bootstrap(&self) -> Result<(), SyncError> {
        let metered = self.lock(&self.metered)?;
        match metered.bootstrap {
            Some(estimate_bytes) if !metered.is_free() => Err(SyncError::Metered { estimate_bytes }),
            _ => Ok(()),
        }
    }

    /// Fails when a bootstrap of `bytes` is bulk on this network.
    pub(crate) fn check_bootstrap(&self, bytes: u64) -> Result<(), SyncError> {
        let mut metered = self.lock(&self.metered)?;
        if metered.is_free() || bytes <= metered.network.bulk_limit_bytes {
            return Ok(());
        }
        metered.bootstrap = Some(bytes);
        Err(SyncError::Metered { estimate_bytes: bytes })
    }

    /// Whether the outbox is past the limit on this network, as after a large local import, so its push waits.
    pub(crate) async fn is_push_held(self: &Arc<Self>) -> Result<bool, SyncError> {
        if self.lock(&self.metered)?.is_free() {
            return Ok(false);
        }
        let bytes = self.blocking(|shared| pending_bytes(&shared.db)).await?;
        let mut metered = self.lock(&self.metered)?;
        let is_held = !metered.is_free() && bytes > metered.network.bulk_limit_bytes;
        metered.outbox = is_held.then_some(bytes);
        Ok(is_held)
    }

    /// Whether counted bulk work may move more on this network.
    pub(crate) fn has_bulk_room(&self) -> Result<bool, SyncError> {
        Ok(self.lock(&self.metered)?.has_room())
    }

    /// Whether counted bulk work is being counted, so it needs to measure what it moves.
    pub(crate) fn is_counting_bulk(&self) -> Result<bool, SyncError> {
        Ok(!self.lock(&self.metered)?.is_free())
    }

    pub(crate) fn spend_bulk(&self, bytes: u64) -> Result<(), SyncError> {
        let mut metered = self.lock(&self.metered)?;
        if !metered.is_free() {
            metered.spent = metered.spent.saturating_add(bytes);
        }
        Ok(())
    }

    /// Records that counted bulk work stopped with work left, so the status shows the pause.
    pub(crate) fn hold_bulk(&self) -> Result<(), SyncError> {
        self.lock(&self.metered)?.is_held = true;
        Ok(())
    }
}
