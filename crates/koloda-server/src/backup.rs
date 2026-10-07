//! `koloda-server backup`: an online copy of the active generation into an empty directory, with a manifest that
//! `restore` checks before it trusts the copy (`crates/koloda-server/README.md`).
//!
//! WHY no lock: each space database is copied in one read transaction (`VACUUM INTO`), so the copy is one committed
//! state of that space, and heal's cutoffs come from the same file. The cut between files does no harm: a device
//! enrolled after `server.db` was copied re-attaches, one newer than its space copy re-pushes everything, and restore
//! clamps record cursors to the restored heads (`PROTOCOL.md` §Server restore).

use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::data_dir::{self, DataDirError, ATTACHMENTS, SERVER_DB, SPACES};
use crate::db::{self, DbError};

pub const MANIFEST: &str = "manifest.json";
pub const MANIFEST_FORMAT: u32 = 1;

/// What a backup holds. `restore` refuses a copy whose files do not match it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub format: u32,
    pub created_at: u64,
    /// The generation the copy was taken from.
    pub generation: String,
    pub server_db: FileSum,
    pub spaces: Vec<SpaceManifest>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FileSum {
    pub sha256: String,
    pub size: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SpaceManifest {
    pub id: Uuid,
    pub epoch: Uuid,
    pub file: FileSum,
    pub head_hot: u64,
    pub head_cold: u64,
    /// Each sender's highest consumed seq: the cutoff a heal restore of this copy reports.
    pub senders: Vec<SenderSeq>,
    /// Attachment ids whose bytes the copy holds; each file is named by the SHA-256 of its bytes.
    pub attachments: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SenderSeq {
    pub sender: Uuid,
    pub last_seq: u64,
}

#[derive(Debug)]
pub enum BackupError {
    NotEmpty(PathBuf),
    DataDir(DataDirError),
    Io(io::Error),
    Db(DbError),
    Manifest(serde_json::Error),
}

/// Copies the active generation of `data_dir` into `out_dir`, which must be missing or empty.
pub fn backup(data_dir: &Path, out_dir: &Path, now_ms: u64) -> Result<Manifest, BackupError> {
    if fs::read_dir(out_dir).is_ok_and(|mut entries| entries.next().is_some()) {
        return Err(BackupError::NotEmpty(out_dir.to_path_buf()));
    }
    let generation = data_dir::active_generation(data_dir)?;
    let generation_id = generation
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    fs::create_dir_all(out_dir.join(SPACES))?;

    let source = db::open_reader(&generation.join(SERVER_DB))?;
    let listed: Vec<Uuid> = source
        .prepare("SELECT id FROM spaces ORDER BY id")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(DbError::from)?;
    drop(source);

    let mut spaces = Vec::with_capacity(listed.len());
    for id in listed {
        let path = generation.join(SPACES).join(format!("{id}.db"));
        if !path.exists() {
            continue;
        }
        spaces.push(copy_space(&generation, out_dir, id, &path)?);
    }

    // INVARIANT: `server.db` is copied after every space, so its roster is the newest; a space created after its own
    // copy was taken has no file in the backup and goes from the roster too.
    let server_copy = out_dir.join(SERVER_DB);
    copy_database(&generation.join(SERVER_DB), &server_copy)?;
    let conn = Connection::open(&server_copy).map_err(DbError::from)?;
    let kept: Vec<String> = spaces.iter().map(|space| format!("x'{}'", space.id.simple())).collect();
    let kept = kept.join(", ");
    for table in ["pairings", "devices"] {
        conn.execute(&format!("DELETE FROM {table} WHERE space_id NOT IN ({kept})"), [])
            .map_err(DbError::from)?;
    }
    conn.execute(&format!("DELETE FROM spaces WHERE id NOT IN ({kept})"), [])
        .map_err(DbError::from)?;
    drop(conn);
    sync(&server_copy)?;

    let manifest = Manifest {
        format: MANIFEST_FORMAT,
        created_at: now_ms,
        generation: generation_id,
        server_db: sum(&server_copy)?,
        spaces,
    };
    sync(&out_dir.join(SPACES))?;
    sync(&out_dir.join(ATTACHMENTS)).or_else(|error| match error.kind() {
        io::ErrorKind::NotFound => Ok(()),
        _ => Err(error),
    })?;
    // INVARIANT: the manifest is written last, so a backup that stopped part way has none and is refused on restore.
    let manifest_path = out_dir.join(MANIFEST);
    fs::write(
        &manifest_path,
        serde_json::to_vec_pretty(&manifest).map_err(BackupError::Manifest)?,
    )?;
    sync(&manifest_path)?;
    sync(out_dir)?;
    Ok(manifest)
}

fn copy_space(generation: &Path, out_dir: &Path, id: Uuid, path: &Path) -> Result<SpaceManifest, BackupError> {
    let copy = out_dir.join(SPACES).join(format!("{id}.db"));
    copy_database(path, &copy)?;
    let conn = Connection::open(&copy).map_err(DbError::from)?;
    let epoch: Uuid = conn
        .query_row("SELECT epoch FROM space WHERE id = 1", [], |row| row.get(0))
        .map_err(DbError::from)?;
    let head = |lane: &str| -> Result<u64, DbError> {
        Ok(
            conn.query_row("SELECT head FROM lanes WHERE lane = ?1", params![lane], |row| {
                row.get(0)
            })?,
        )
    };
    let (head_hot, head_cold) = (head("hot")?, head("cold")?);
    let senders = conn
        .prepare("SELECT sender, last_seq FROM senders ORDER BY sender")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| {
                    Ok(SenderSeq {
                        sender: row.get(0)?,
                        last_seq: row.get(1)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(DbError::from)?;
    let stored: Vec<String> = conn
        .prepare("SELECT id FROM attachments ORDER BY id")
        .and_then(|mut statement| statement.query_map([], |row| row.get(0))?.collect())
        .map_err(DbError::from)?;

    let from = generation.join(ATTACHMENTS).join(id.to_string());
    let to = out_dir.join(ATTACHMENTS).join(id.to_string());
    let mut attachments = Vec::with_capacity(stored.len());
    for attachment in stored {
        if attachments.is_empty() {
            fs::create_dir_all(&to)?;
        }
        match fs::copy(from.join(&attachment), to.join(&attachment)) {
            Ok(_) => {
                sync(&to.join(&attachment))?;
                attachments.push(attachment);
            }
            // WHY: collection deletes the row, then the file. A row the copy holds whose file is already gone was
            // being collected: no card had linked it for 90 days.
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                conn.execute("DELETE FROM attachments WHERE id = ?1", params![attachment])
                    .map_err(DbError::from)?;
            }
            Err(error) => return Err(error.into()),
        }
    }
    if !attachments.is_empty() {
        sync(&to)?;
    }
    drop(conn);
    sync(&copy)?;

    Ok(SpaceManifest {
        id,
        epoch,
        file: sum(&copy)?,
        head_hot,
        head_cold,
        senders,
        attachments,
    })
}

fn copy_database(from: &Path, to: &Path) -> Result<(), BackupError> {
    let source = db::open_reader(from)?;
    source
        .execute("VACUUM INTO ?1", params![to.to_string_lossy()])
        .map_err(DbError::from)?;
    Ok(())
}

pub(crate) fn sum(path: &Path) -> Result<FileSum, io::Error> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0; 64 * 1024];
    let mut size = 0;
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(buffer.get(..read).unwrap_or_default());
        size += u64::try_from(read).unwrap_or(u64::MAX);
    }
    Ok(FileSum {
        sha256: format!("{:x}", hasher.finalize()),
        size,
    })
}

/// Flushes a file or a directory to disk.
pub(crate) fn sync(path: &Path) -> io::Result<()> {
    File::open(path)?.sync_all()
}

impl From<io::Error> for BackupError {
    fn from(error: io::Error) -> Self {
        BackupError::Io(error)
    }
}

impl From<DbError> for BackupError {
    fn from(error: DbError) -> Self {
        BackupError::Db(error)
    }
}

impl From<DataDirError> for BackupError {
    fn from(error: DataDirError) -> Self {
        BackupError::DataDir(error)
    }
}

impl fmt::Display for BackupError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BackupError::NotEmpty(dir) => write!(f, "{} is not empty", dir.display()),
            BackupError::DataDir(error) => write!(f, "{error}"),
            BackupError::Io(error) => write!(f, "{error}"),
            BackupError::Db(error) => write!(f, "{error}"),
            BackupError::Manifest(error) => write!(f, "manifest: {error}"),
        }
    }
}

impl std::error::Error for BackupError {}
