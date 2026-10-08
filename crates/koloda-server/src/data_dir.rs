//! Data directory: `CURRENT` names the active generation under `generations/`, which holds `server.db`,
//! `spaces/<space>.db`, and `attachments/<space>/`; `lock` keeps a second `serve` off the same directory.
//!
//! WHY: a restore writes a new generation and swaps `CURRENT`, so live files are never rewritten in place.

use std::fmt;
use std::fs::{self, File, TryLockError};
use std::io;
use std::path::{Path, PathBuf};

use rusqlite::params;
use uuid::Uuid;

use crate::auth;
use crate::db::{self, DbError};

const CURRENT: &str = "CURRENT";
const CURRENT_STAGED: &str = "CURRENT.tmp";
const GENERATIONS: &str = "generations";
const LOCK: &str = "lock";
pub(crate) const ATTACHMENTS: &str = "attachments";
pub(crate) const SERVER_DB: &str = "server.db";
pub(crate) const SPACES: &str = "spaces";

#[derive(Debug)]
pub enum DataDirError {
    AlreadyInitialized(PathBuf),
    NotInitialized(PathBuf),
    Locked(PathBuf),
    Io(io::Error),
    Db(DbError),
    Random(getrandom::Error),
}

/// Creates the first generation and returns the setup token, which is stored only as its hash.
pub fn init(data_dir: &Path, now_ms: u64) -> Result<String, DataDirError> {
    if data_dir.join(CURRENT).exists() {
        return Err(DataDirError::AlreadyInitialized(data_dir.to_path_buf()));
    }
    let generation = Uuid::new_v4().to_string();
    let root = data_dir.join(GENERATIONS).join(&generation);
    fs::create_dir_all(root.join(SPACES))?;

    let token = auth::new_token().map_err(DataDirError::Random)?;
    let conn = db::open_server(&root.join(SERVER_DB))?;
    conn.execute(
        "INSERT INTO setup (id, token_hash, created_at) VALUES (1, ?1, ?2)",
        params![auth::token_hash(&token).to_vec(), now_ms],
    )
    .map_err(DbError::from)?;
    drop(conn);

    // INVARIANT: `CURRENT` appears only once its generation is complete, so a crashed init leaves no server behind.
    swap_current(data_dir, &generation)?;
    Ok(token)
}

/// Makes `generation` the active one: `CURRENT` is replaced in one rename, so a crash leaves the old or the new.
pub(crate) fn swap_current(data_dir: &Path, generation: &str) -> Result<(), DataDirError> {
    let staged = data_dir.join(CURRENT_STAGED);
    fs::write(&staged, format!("{generation}\n"))?;
    File::open(&staged)?.sync_all()?;
    fs::rename(staged, data_dir.join(CURRENT))?;
    File::open(data_dir)?.sync_all()?;
    Ok(())
}

pub(crate) fn generations_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(GENERATIONS)
}

pub(crate) fn active_generation(data_dir: &Path) -> Result<PathBuf, DataDirError> {
    match fs::read_to_string(data_dir.join(CURRENT)) {
        Ok(current) => Ok(data_dir.join(GENERATIONS).join(current.trim())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            Err(DataDirError::NotInitialized(data_dir.to_path_buf()))
        }
        Err(error) => Err(error.into()),
    }
}

/// Held by `serve` for its whole run; dropping it releases the directory.
pub struct DataDirLock {
    _file: File,
}

impl DataDirLock {
    pub fn acquire(data_dir: &Path) -> Result<DataDirLock, DataDirError> {
        active_generation(data_dir)?;
        DataDirLock::acquire_any(data_dir)
    }

    /// Takes the lock on a directory whether or not it holds a server yet, as a restore onto a new machine must.
    pub(crate) fn acquire_any(data_dir: &Path) -> Result<DataDirLock, DataDirError> {
        fs::create_dir_all(data_dir)?;
        let file = File::options()
            .create(true)
            .truncate(false)
            .write(true)
            .open(data_dir.join(LOCK))?;
        match file.try_lock() {
            Ok(()) => Ok(DataDirLock { _file: file }),
            Err(TryLockError::WouldBlock) => Err(DataDirError::Locked(data_dir.to_path_buf())),
            Err(TryLockError::Error(error)) => Err(error.into()),
        }
    }
}

impl From<io::Error> for DataDirError {
    fn from(error: io::Error) -> Self {
        DataDirError::Io(error)
    }
}

impl From<DbError> for DataDirError {
    fn from(error: DbError) -> Self {
        DataDirError::Db(error)
    }
}

impl fmt::Display for DataDirError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DataDirError::AlreadyInitialized(dir) => write!(f, "{} already holds a server", dir.display()),
            DataDirError::NotInitialized(dir) => {
                write!(f, "{} holds no server; run `koloda-server init` first", dir.display())
            }
            DataDirError::Locked(dir) => write!(f, "another server is running on {}", dir.display()),
            DataDirError::Io(error) => write!(f, "{error}"),
            DataDirError::Db(error) => write!(f, "{error}"),
            DataDirError::Random(error) => write!(f, "no system randomness: {error}"),
        }
    }
}

impl std::error::Error for DataDirError {}
