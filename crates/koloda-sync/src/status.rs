//! What the host shows about sync: the state, why it stopped, and how far behind the file is.

use std::sync::Arc;

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
    Behind,
    ClockSkew,
    Revoked,
    UnknownDevice,
    PushRefused(ErrorCode),
    Error(String),
}

impl Stop {
    pub(crate) fn of(error: &SyncError) -> Stop {
        match error {
            SyncError::Behind => Stop::Behind,
            SyncError::ClockSkew { .. } => Stop::ClockSkew,
            SyncError::Revoked | SyncError::Detached => Stop::Revoked,
            SyncError::UnknownDevice => Stop::UnknownDevice,
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
            });
        };
        let shown = if state.is_detached {
            State::Stopped(Stop::Revoked)
        } else if state.is_import_pending {
            State::ImportPending
        } else if run.is_syncing && state.is_bootstrapping {
            State::Bootstrapping
        } else if run.is_syncing {
            State::Syncing
        } else if let Some(stop) = run.stop.clone() {
            State::Stopped(stop)
        } else if state.is_bootstrapping {
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
        })
    }
}
