//! `koloda-server restore`: a backup becomes a new generation with a fresh epoch and an appended restore point per
//! space, then `CURRENT` swaps to it (`crates/koloda-sync-proto/PROTOCOL.md` §Server restore).
//!
//! `prepare` stages and checks everything and lists the restored devices; nothing is live until `commit`. The
//! replaced generation stays on disk: it is where revocations and restore points newer than the backup come from.

use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use koloda_sync_proto::transport::{Cutoff, Restore, RestoreMode};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::backup::{self, Manifest, MANIFEST, MANIFEST_FORMAT};
use crate::data_dir::{self, DataDirError, DataDirLock, ATTACHMENTS, SERVER_DB, SPACES};
use crate::db::{self, DbError};
use crate::http::ApiError;
use crate::log;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RestoreOptions {
    pub mode: RestoreMode,
    /// Revokes every restored device, so each re-pairs (`PROTOCOL.md` §Server restore).
    pub is_rotating_tokens: bool,
}

/// A device as the restore leaves it; `last_seen` is from the backup, so the operator can spot a stale roster.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RestoredDevice {
    pub space: Uuid,
    pub space_name: String,
    pub id: Uuid,
    pub name: String,
    pub platform: String,
    pub last_seen: u64,
    pub is_revoked: bool,
}

/// A staged generation that is not live yet. Holds the data directory lock until it is committed or aborted.
pub struct Prepared {
    data_dir: PathBuf,
    generation: String,
    staged: PathBuf,
    devices: Vec<RestoredDevice>,
    epochs: Vec<(Uuid, Uuid)>,
    _lock: DataDirLock,
}

#[derive(Debug)]
pub enum RestoreError {
    DataDir(DataDirError),
    Io(io::Error),
    Db(DbError),
    Manifest(serde_json::Error),
    Format(u32),
    Mismatch(String),
}

/// One restore point as a space database stores it.
struct Point {
    epoch: Uuid,
    mode: String,
    head_hot: u64,
    head_cold: u64,
    restored_at: u64,
    cutoffs: Vec<(Uuid, u64)>,
}

/// Stages `backup_dir` as a new generation of `data_dir`, which may hold no server yet.
pub fn prepare(
    data_dir: &Path,
    backup_dir: &Path,
    options: RestoreOptions,
    now_ms: u64,
) -> Result<Prepared, RestoreError> {
    let lock = DataDirLock::acquire_any(data_dir)?;
    let manifest: Manifest =
        serde_json::from_slice(&fs::read(backup_dir.join(MANIFEST))?).map_err(RestoreError::Manifest)?;
    if manifest.format != MANIFEST_FORMAT {
        return Err(RestoreError::Format(manifest.format));
    }
    let replaced = match data_dir::active_generation(data_dir) {
        Ok(generation) => Some(generation),
        Err(DataDirError::NotInitialized(_)) => None,
        Err(error) => return Err(error.into()),
    };
    let generation = Uuid::new_v4().to_string();
    let staged = data_dir::generations_dir(data_dir).join(&generation);

    match stage(&staged, backup_dir, &manifest, replaced.as_deref(), options, now_ms) {
        Ok((devices, epochs)) => Ok(Prepared {
            data_dir: data_dir.to_path_buf(),
            generation,
            staged,
            devices,
            epochs,
            _lock: lock,
        }),
        Err(error) => {
            // WHY: the staged generation is unreferenced; a failed cleanup leaves only an unused directory behind.
            drop(fs::remove_dir_all(&staged));
            Err(error)
        }
    }
}

impl Prepared {
    pub fn devices(&self) -> &[RestoredDevice] {
        &self.devices
    }

    /// Each restored space with its new epoch.
    pub fn epochs(&self) -> &[(Uuid, Uuid)] {
        &self.epochs
    }

    /// Makes the staged generation live and returns its id.
    pub fn commit(self) -> Result<String, RestoreError> {
        data_dir::swap_current(&self.data_dir, &self.generation)?;
        Ok(self.generation)
    }

    pub fn abort(self) -> Result<(), RestoreError> {
        fs::remove_dir_all(&self.staged)?;
        Ok(())
    }
}

/// The restore a device on `epoch` must apply to reach the space's `current` epoch: every point after the last one
/// that issued `epoch`, or every point when none did, combined as one (`PROTOCOL.md` §Server restore).
///
/// INVARIANT: combined, the mode is authoritative if any point is, each head is the lowest, and each sender's cutoff
/// is the lowest; a sender a point does not list had nothing in that backup, so it is left out (cutoff 0).
pub(crate) fn combined(conn: &Connection, epoch: Uuid, current: Uuid) -> Result<Restore, ApiError> {
    let points: Vec<(i64, Uuid, String, u64, u64)> = conn
        .prepare("SELECT position, epoch, mode, head_hot, head_cold FROM restore_points ORDER BY position")?
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
        })?
        .collect::<Result<_, _>>()?;
    let after = points
        .iter()
        .rposition(|(_, issued, ..)| *issued == epoch)
        .map_or(0, |index| index + 1);
    let applied = points.get(after..).unwrap_or_default();

    // WHY: an epoch no point follows has nothing to apply; it is sent back to the current epoch with every sender's
    // cutoff at its high-water, so it re-pushes nothing the space already took.
    if applied.is_empty() {
        let (head_hot, head_cold) = log::lane_heads(conn)?;
        let cutoffs = conn
            .prepare("SELECT sender, last_seq FROM senders ORDER BY sender")?
            .query_map([], |row| {
                Ok(Cutoff {
                    sender: row.get::<_, Uuid>(0)?.into_bytes(),
                    last_seq: row.get(1)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        return Ok(Restore {
            epoch: current.into_bytes(),
            mode: RestoreMode::Heal,
            head_hot,
            head_cold,
            cutoffs,
        });
    }

    let mut cutoffs: Option<Vec<Cutoff>> = None;
    for (position, ..) in applied {
        let point: Vec<Cutoff> = conn
            .prepare("SELECT sender, last_seq FROM restore_cutoffs WHERE position = ?1 ORDER BY sender")?
            .query_map(params![position], |row| {
                Ok(Cutoff {
                    sender: row.get::<_, Uuid>(0)?.into_bytes(),
                    last_seq: row.get(1)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        cutoffs = Some(match cutoffs {
            None => point,
            Some(lowest) => lowest
                .into_iter()
                .filter_map(|cutoff| {
                    let other = point.iter().find(|other| other.sender == cutoff.sender)?;
                    Some(Cutoff {
                        sender: cutoff.sender,
                        last_seq: cutoff.last_seq.min(other.last_seq),
                    })
                })
                .collect(),
        });
    }
    let is_authoritative = applied
        .iter()
        .any(|(_, _, mode, ..)| mode == RestoreMode::Authoritative.as_wire());
    Ok(Restore {
        epoch: current.into_bytes(),
        mode: if is_authoritative {
            RestoreMode::Authoritative
        } else {
            RestoreMode::Heal
        },
        head_hot: applied
            .iter()
            .map(|(_, _, _, head_hot, _)| *head_hot)
            .min()
            .unwrap_or_default(),
        head_cold: applied
            .iter()
            .map(|(_, _, _, _, head_cold)| *head_cold)
            .min()
            .unwrap_or_default(),
        cutoffs: cutoffs.unwrap_or_default(),
    })
}

type Staged = (Vec<RestoredDevice>, Vec<(Uuid, Uuid)>);

fn stage(
    staged: &Path,
    backup_dir: &Path,
    manifest: &Manifest,
    replaced: Option<&Path>,
    options: RestoreOptions,
    now_ms: u64,
) -> Result<Staged, RestoreError> {
    // INVARIANT: the staged copies are what gets checked, so nothing that differs from the manifest goes live.
    fs::create_dir_all(staged.join(SPACES))?;
    copy_checked(
        &backup_dir.join(SERVER_DB),
        &staged.join(SERVER_DB),
        &manifest.server_db.sha256,
    )?;
    for space in &manifest.spaces {
        let file = format!("{}.db", space.id);
        copy_checked(
            &backup_dir.join(SPACES).join(&file),
            &staged.join(SPACES).join(&file),
            &space.file.sha256,
        )?;
        let from = backup_dir.join(ATTACHMENTS).join(space.id.to_string());
        let to = staged.join(ATTACHMENTS).join(space.id.to_string());
        if !space.attachments.is_empty() {
            fs::create_dir_all(&to)?;
        }
        for attachment in &space.attachments {
            copy_checked(&from.join(attachment), &to.join(attachment), attachment)?;
        }
    }

    let mut epochs = Vec::with_capacity(manifest.spaces.len());
    let mut heads = Vec::with_capacity(manifest.spaces.len());
    for space in &manifest.spaces {
        let file = format!("{}.db", space.id);
        let carried = match replaced.map(|generation| generation.join(SPACES).join(&file)) {
            Some(path) if path.exists() => read_points(&db::open_reader(&path)?)?,
            _ => Vec::new(),
        };
        let epoch = Uuid::new_v4();
        let mut conn = db::open_space(&staged.join(SPACES).join(&file))?;
        let (head_hot, head_cold) = append_point(&mut conn, carried, epoch, options.mode, now_ms)?;
        epochs.push((space.id, epoch));
        heads.push((space.id, head_hot, head_cold));
    }

    let mut conn = db::open_server(&staged.join(SERVER_DB))?;
    let mut devices = read_devices(&conn)?;
    let revoked = match replaced.map(|generation| generation.join(SERVER_DB)) {
        Some(path) if path.exists() => read_revocations(&db::open_reader(&path)?)?,
        _ => Vec::new(),
    };
    let tx = conn.transaction().map_err(DbError::from)?;
    tx.execute("DELETE FROM pairings", []).map_err(DbError::from)?;
    tx.execute("DELETE FROM space_creations", []).map_err(DbError::from)?;
    // WHY: an old backup must not mark everyone stale, and a record cursor past the restored head would let GC take
    // tombstones a device never pulled from this generation.
    tx.execute("UPDATE devices SET last_seen = ?1", params![now_ms])
        .map_err(DbError::from)?;
    for (space, head_hot, head_cold) in &heads {
        tx.execute(
            r#"
            UPDATE devices SET cursor_hot = MIN(cursor_hot, ?2), cursor_cold = MIN(cursor_cold, ?3)
            WHERE space_id = ?1
            "#,
            params![space, head_hot, head_cold],
        )
        .map_err(DbError::from)?;
    }
    // INVARIANT: a device revoked after the backup stays revoked whenever the replaced data says so; tokens survive a
    // restore, so it would otherwise come back (PROTOCOL.md, Server restore).
    for (device, revoked_at) in revoked {
        tx.execute(
            "UPDATE devices SET revoked_at = COALESCE(revoked_at, ?2) WHERE id = ?1",
            params![device, revoked_at],
        )
        .map_err(DbError::from)?;
    }
    if options.is_rotating_tokens {
        tx.execute(
            "UPDATE devices SET revoked_at = COALESCE(revoked_at, ?1)",
            params![now_ms],
        )
        .map_err(DbError::from)?;
    }
    tx.commit().map_err(DbError::from)?;
    for device in &mut devices {
        device.is_revoked = conn
            .query_row(
                "SELECT revoked_at IS NOT NULL FROM devices WHERE id = ?1",
                params![device.id],
                |row| row.get(0),
            )
            .map_err(DbError::from)?;
    }
    drop(conn);

    sync_tree(staged)?;
    Ok((devices, epochs))
}

fn copy_checked(from: &Path, to: &Path, sha256: &str) -> Result<(), RestoreError> {
    fs::copy(from, to)?;
    if backup::sum(to)?.sha256 != sha256 {
        return Err(RestoreError::Mismatch(from.display().to_string()));
    }
    Ok(())
}

fn read_points(conn: &Connection) -> Result<Vec<Point>, RestoreError> {
    let has_points: bool = conn
        .query_row(
            "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'restore_points')",
            [],
            |row| row.get(0),
        )
        .map_err(DbError::from)?;
    if !has_points {
        return Ok(Vec::new());
    }
    let mut points: Vec<(i64, Point)> = conn
        .prepare("SELECT position, epoch, mode, head_hot, head_cold, restored_at FROM restore_points ORDER BY position")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| {
                    Ok((
                        row.get(0)?,
                        Point {
                            epoch: row.get(1)?,
                            mode: row.get(2)?,
                            head_hot: row.get(3)?,
                            head_cold: row.get(4)?,
                            restored_at: row.get(5)?,
                            cutoffs: Vec::new(),
                        },
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(DbError::from)?;
    for (position, point) in &mut points {
        point.cutoffs = conn
            .prepare("SELECT sender, last_seq FROM restore_cutoffs WHERE position = ?1 ORDER BY sender")
            .and_then(|mut statement| {
                statement
                    .query_map(params![*position], |row| Ok((row.get(0)?, row.get(1)?)))?
                    .collect::<Result<Vec<_>, _>>()
            })
            .map_err(DbError::from)?;
    }
    Ok(points.into_iter().map(|(_, point)| point).collect())
}

/// Writes the space's points: its own, then the replaced generation's it lacks, then a new one at the backup's heads
/// and cutoffs. Moves the space to `epoch`, drops its leases, and returns its lane heads.
fn append_point(
    conn: &mut Connection,
    carried: Vec<Point>,
    epoch: Uuid,
    mode: RestoreMode,
    now_ms: u64,
) -> Result<(u64, u64), RestoreError> {
    let mut points = read_points(conn)?;
    for point in carried {
        if !points.iter().any(|known| known.epoch == point.epoch) {
            points.push(point);
        }
    }
    let head = |lane: &str| -> Result<u64, DbError> {
        Ok(
            conn.query_row("SELECT head FROM lanes WHERE lane = ?1", params![lane], |row| {
                row.get(0)
            })?,
        )
    };
    let (head_hot, head_cold) = (head("hot")?, head("cold")?);
    let cutoffs = conn
        .prepare("SELECT sender, last_seq FROM senders ORDER BY sender")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(DbError::from)?;
    points.push(Point {
        epoch,
        mode: mode.as_wire().to_string(),
        head_hot,
        head_cold,
        restored_at: now_ms,
        cutoffs,
    });

    let tx = conn.transaction().map_err(DbError::from)?;
    tx.execute("DELETE FROM restore_cutoffs", []).map_err(DbError::from)?;
    tx.execute("DELETE FROM restore_points", []).map_err(DbError::from)?;
    for (position, point) in (1_i64..).zip(&points) {
        tx.execute(
            r#"
            INSERT INTO restore_points (position, epoch, mode, head_hot, head_cold, restored_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![
                position,
                point.epoch,
                point.mode,
                point.head_hot,
                point.head_cold,
                point.restored_at
            ],
        )
        .map_err(DbError::from)?;
        for (sender, last_seq) in &point.cutoffs {
            tx.execute(
                "INSERT INTO restore_cutoffs (position, sender, last_seq) VALUES (?1, ?2, ?3)",
                params![position, sender, last_seq],
            )
            .map_err(DbError::from)?;
        }
    }
    tx.execute("UPDATE space SET epoch = ?1 WHERE id = 1", params![epoch])
        .map_err(DbError::from)?;
    // WHY: a lease names versions of the replaced generation's log; its device restarts its bootstrap.
    tx.execute("DELETE FROM lease_items", []).map_err(DbError::from)?;
    tx.execute("DELETE FROM leases", []).map_err(DbError::from)?;
    tx.commit().map_err(DbError::from)?;
    Ok((head_hot, head_cold))
}

fn read_devices(conn: &Connection) -> Result<Vec<RestoredDevice>, RestoreError> {
    let devices = conn
        .prepare(
            r#"
            SELECT d.space_id, s.name, d.id, d.name, d.platform, d.last_seen, d.revoked_at IS NOT NULL
            FROM devices d JOIN spaces s ON s.id = d.space_id
            ORDER BY s.name, d.name
            "#,
        )
        .and_then(|mut statement| {
            statement
                .query_map([], |row| {
                    Ok(RestoredDevice {
                        space: row.get(0)?,
                        space_name: row.get(1)?,
                        id: row.get(2)?,
                        name: row.get(3)?,
                        platform: row.get(4)?,
                        last_seen: row.get(5)?,
                        is_revoked: row.get(6)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(DbError::from)?;
    Ok(devices)
}

fn read_revocations(conn: &Connection) -> Result<Vec<(Uuid, u64)>, RestoreError> {
    let revoked = conn
        .prepare("SELECT id, revoked_at FROM devices WHERE revoked_at IS NOT NULL")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(DbError::from)?;
    Ok(revoked)
}

fn sync_tree(dir: &Path) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            sync_tree(&path)?;
        } else {
            backup::sync(&path)?;
        }
    }
    backup::sync(dir)
}

impl From<io::Error> for RestoreError {
    fn from(error: io::Error) -> Self {
        RestoreError::Io(error)
    }
}

impl From<DbError> for RestoreError {
    fn from(error: DbError) -> Self {
        RestoreError::Db(error)
    }
}

impl From<DataDirError> for RestoreError {
    fn from(error: DataDirError) -> Self {
        RestoreError::DataDir(error)
    }
}

impl fmt::Display for RestoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RestoreError::DataDir(error) => write!(f, "{error}"),
            RestoreError::Io(error) => write!(f, "{error}"),
            RestoreError::Db(error) => write!(f, "{error}"),
            RestoreError::Manifest(error) => write!(f, "manifest: {error}"),
            RestoreError::Format(format) => {
                write!(f, "this server reads backup format {MANIFEST_FORMAT}, not {format}")
            }
            RestoreError::Mismatch(file) => write!(f, "{file} does not match the backup's manifest"),
        }
    }
}

impl std::error::Error for RestoreError {}
