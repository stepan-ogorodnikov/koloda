//! What the host shows about sync: the state, why it stopped, and how far behind the file is.

use std::sync::Arc;

use koloda::repo::sync::apply::Hold;
use koloda::repo::sync::attachments::transfer_counts;
use koloda::repo::sync::outbox::{held_count, pending_count};
use koloda::repo::sync::sync_state;
use koloda_sync_proto::transport::ErrorCode;

use crate::engine::Shared;
use crate::error::SyncError;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Status {
    pub state: State,
    /// Local time of the last cycle that finished, in unix milliseconds.
    pub last_success_ms: Option<i64>,
    pub pending: usize,
    pub held: usize,
    /// Images waiting to go up or come down.
    pub uploads: usize,
    pub fetches: usize,
    /// How far each lane's cursor is below the last head the server reported.
    pub lag_hot: Option<u64>,
    pub lag_cold: Option<u64>,
    pub skew_ms: i64,
    /// The envelope a lane stopped at in the last pull; pushing and the other lane may still run.
    pub hold: Option<Hold>,
    /// The space was over its quota, or the server low on disk, at the last device record: growing writes wait.
    pub is_over_quota: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum State {
    NotEnrolled,
    ImportPending,
    Bootstrapping,
    Idle,
    Syncing,
    Stopped(Stop),
}

/// Why the last cycle stopped; the next trigger tries again.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Stop {
    ClockSkew,
    Revoked,
    UnknownDevice,
    /// An authoritative server restore waits for the host to accept it (`Engine::accept_restore`).
    AuthoritativeRestore,
    /// The server was restored and no longer takes this device's token; the file detached and re-attaches with a
    /// pairing code.
    Restored,
    PushRefused(ErrorCode),
    Error(String),
}

impl Stop {
    pub(crate) fn of(error: &SyncError) -> Stop {
        match error {
            SyncError::ClockSkew { .. } => Stop::ClockSkew,
            SyncError::Revoked | SyncError::Detached => Stop::Revoked,
            SyncError::UnknownDevice => Stop::UnknownDevice,
            SyncError::RestoreHeld => Stop::AuthoritativeRestore,
            SyncError::PairAgain => Stop::Restored,
            SyncError::PushRefused { code, .. } => Stop::PushRefused(*code),
            other => Stop::Error(other.to_string()),
        }
    }
}

/// What the runtime knows that the database does not.
#[derive(Clone, Default)]
pub(crate) struct RunState {
    pub(crate) is_syncing: bool,
    pub(crate) stop: Option<Stop>,
    pub(crate) last_success_ms: Option<i64>,
    pub(crate) heads: Option<(u64, u64)>,
    /// The highest heads nudged during the running cycle, checked once it ends.
    pub(crate) nudged: Option<(u64, u64)>,
    pub(crate) hold: Option<Hold>,
    pub(crate) is_over_quota: bool,
}

impl Shared {
    pub(crate) async fn status(self: &Arc<Self>) -> Result<Status, SyncError> {
        let (state, pending, held, (uploads, fetches)) = self
            .blocking(|shared| {
                Ok((
                    sync_state(&shared.db)?,
                    pending_count(&shared.db)?,
                    held_count(&shared.db)?,
                    transfer_counts(&shared.db)?,
                ))
            })
            .await?;
        let run = self.run_state()?;
        let skew_ms = self.skew.get();
        let Some(state) = state else {
            return Ok(Status {
                state: State::NotEnrolled,
                last_success_ms: run.last_success_ms,
                pending,
                held,
                uploads,
                fetches,
                lag_hot: None,
                lag_cold: None,
                skew_ms,
                hold: None,
                is_over_quota: false,
            });
        };
        let shown = if state.is_detached {
            State::Stopped(match run.stop {
                Some(Stop::Restored) => Stop::Restored,
                _ => Stop::Revoked,
            })
        } else if state.is_restore_held {
            State::Stopped(Stop::AuthoritativeRestore)
        } else if state.is_import_pending {
            State::ImportPending
        } else if run.is_syncing && (state.is_bootstrapping || state.is_rebasing) {
            State::Bootstrapping
        } else if run.is_syncing {
            State::Syncing
        } else if let Some(stop) = run.stop.clone() {
            State::Stopped(stop)
        } else if state.is_bootstrapping || state.is_rebasing {
            State::Bootstrapping
        } else {
            State::Idle
        };
        Ok(Status {
            state: shown,
            last_success_ms: run.last_success_ms,
            pending,
            held,
            uploads,
            fetches,
            lag_hot: run.heads.map(|(hot, _)| hot.saturating_sub(state.cursor_hot)),
            lag_cold: run.heads.map(|(_, cold)| cold.saturating_sub(state.cursor_cold)),
            skew_ms,
            hold: run.hold,
            is_over_quota: run.is_over_quota,
        })
    }
}
