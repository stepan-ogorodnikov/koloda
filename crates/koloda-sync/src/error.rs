use std::fmt;

use koloda::app::error::AppError;
use koloda_sync_proto::transport::ErrorCode;

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
    /// The file is behind its own device record, as after a restore from backup or a copy; it stops syncing
    /// (`PROTOCOL.md` §Devices).
    Behind,
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
            SyncError::InsecureServerUrl(url) => {
                write!(f, "{url} is not an https URL or an http URL to this machine")
            }
        }
    }
}

impl std::error::Error for SyncError {}
