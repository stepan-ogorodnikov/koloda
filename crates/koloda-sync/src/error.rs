use std::fmt;

use koloda::app::error::AppError;
use koloda::repo::sync::join::JoinMode;
use koloda_sync_proto::transport::{ErrorCode, Restore};

#[derive(Debug)]
pub enum SyncError {
    /// No complete reply: the connection failed, timed out, or answered with a body that is not a reply.
    Transport(String),
    /// The server answered with an error reply.
    Server {
        status: u16,
        code: ErrorCode,
        message: String,
    },
    Local(AppError),
    /// The file already has sync state, so it cannot create a space; nothing was sent.
    AlreadyEnrolled,
    /// The file has no space, server URL, or token to sync with.
    NotEnrolled,
    /// A push came back `seq_reused`: the file is behind its own device record, as after a restore from backup or a
    /// copy, and the cycle forks it (`PROTOCOL.md` §Devices).
    Behind,
    /// The server revoked this device, so the file detached: its token is gone and its rows stay.
    Revoked,
    /// The file is detached from its space and sends nothing until it re-attaches.
    Detached,
    /// The server holds no device for this token, as after a restore that predates it; the engine stops.
    UnknownDevice,
    /// The space was restored since this file last synced; the file applies this restore before anything else
    /// (`PROTOCOL.md` §Server restore). `last_sender_seq` is the server's for this device.
    Restored {
        restore: Restore,
        last_sender_seq: u64,
    },
    /// An authoritative restore waits for the host to accept it; the file sends nothing meanwhile.
    RestoreHeld,
    /// The space was restored and no longer takes this device's token: the device was enrolled after the backup, or
    /// every token was rotated. The file detached and re-attaches with a pairing code.
    PairAgain,
    /// The server answered a push with an error reply, which consumed nothing.
    PushRefused {
        status: u16,
        code: ErrorCode,
        message: String,
    },
    /// A tick spent its budget; the next one resumes from the cursors.
    BudgetSpent,
    /// Server and local time differ by more than 5 minutes, so push and apply pause (`PROTOCOL.md` §Skew guards).
    ClockSkew {
        skew_ms: i64,
    },
    /// The file cannot join the code's space in this mode; nothing was claimed.
    CannotJoin(JoinMode),
    /// The server URL is neither `https` nor `http` to a loopback host; nothing was sent.
    InsecureServerUrl(String),
}

impl From<AppError> for SyncError {
    fn from(error: AppError) -> Self {
        SyncError::Local(error)
    }
}

impl fmt::Display for SyncError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SyncError::Transport(message) => write!(f, "no reply from the sync server: {message}"),
            SyncError::Server { status, code, message } => {
                write!(f, "the sync server answered {status} {code:?}: {message}")
            }
            SyncError::Local(error) => write!(f, "{error}: {}", error.details.as_deref().unwrap_or("")),
            SyncError::AlreadyEnrolled => write!(f, "this file already syncs with a space"),
            SyncError::NotEnrolled => write!(f, "this file does not sync with a space"),
            SyncError::Behind => write!(f, "this file is behind its own record on the sync server"),
            SyncError::Revoked => write!(f, "this device was revoked, so the file detached from its space"),
            SyncError::Detached => write!(f, "this file is detached from its space"),
            SyncError::UnknownDevice => write!(f, "the sync server does not know this device"),
            SyncError::Restored { restore, .. } => write!(f, "the sync server was restored ({:?})", restore.mode),
            SyncError::RestoreHeld => write!(f, "an authoritative server restore waits to be accepted"),
            SyncError::PairAgain => write!(f, "the sync server was restored; pair this device again"),
            SyncError::PushRefused { status, code, message } => {
                write!(f, "the sync server refused a push with {status} {code:?}: {message}")
            }
            SyncError::BudgetSpent => write!(f, "this tick spent its budget"),
            SyncError::ClockSkew { skew_ms } => {
                write!(f, "this device's clock is {skew_ms} ms off the sync server's")
            }
            SyncError::CannotJoin(mode) => write!(f, "this file cannot join that space as {mode:?}"),
            SyncError::InsecureServerUrl(url) => {
                write!(f, "{url} is not an https URL or an http URL to this machine")
            }
        }
    }
}

impl std::error::Error for SyncError {}
