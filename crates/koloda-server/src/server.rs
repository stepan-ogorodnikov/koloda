//! Shared state behind every handler: the active generation's `server.db`, open space databases, and the clock.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use koloda_sync_proto::payload::SCHEMA;
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::decode_schemas;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::attachments;
use crate::bootstrap;
use crate::clock::Clock;
use crate::data_dir::{self, DataDirError, ATTACHMENTS, SERVER_DB, SPACES};
use crate::db::{self, DbError};
use crate::devices;
use crate::http::ApiError;
use crate::log;
use crate::pairing::Guesses;
use crate::quota::Storage;

pub struct Server {
    generation: PathBuf,
    server_db: Mutex<Connection>,
    spaces: Mutex<HashMap<Uuid, Arc<SpaceDb>>>,
    clock: Arc<dyn Clock>,
    storage: Storage,
    pub(crate) guesses: Mutex<Guesses>,
}

// INVARIANT: every write to a space goes through `writer`, which is that space's writer lock
// (`PROTOCOL.md` §Topology and server state). Reads use `reader`, so they never wait for a write transaction.
pub(crate) struct SpaceDb {
    pub(crate) writer: Mutex<Connection>,
    pub(crate) reader: Mutex<Connection>,
}

impl Server {
    /// Opens the active generation with the disk watermarks off.
    pub fn open(data_dir: &Path, clock: Arc<dyn Clock>) -> Result<Server, DataDirError> {
        Server::open_with(data_dir, clock, Storage::default())
    }

    pub fn open_with(data_dir: &Path, clock: Arc<dyn Clock>, storage: Storage) -> Result<Server, DataDirError> {
        let generation = data_dir::active_generation(data_dir)?;
        let server_db = db::open_server(&generation.join(SERVER_DB))?;
        Ok(Server {
            generation,
            server_db: Mutex::new(server_db),
            spaces: Mutex::new(HashMap::new()),
            clock,
            storage,
            guesses: Mutex::new(Guesses::default()),
        })
    }

    pub(crate) fn now_ms(&self) -> u64 {
        self.clock.now_ms()
    }

    pub(crate) fn storage(&self) -> &Storage {
        &self.storage
    }

    pub(crate) fn generation(&self) -> &Path {
        &self.generation
    }

    pub(crate) fn server_db(&self) -> Result<MutexGuard<'_, Connection>, ApiError> {
        lock(&self.server_db)
    }

    /// The space's databases, or `None` when no space has that id.
    pub(crate) fn space(&self, id: Uuid) -> Result<Option<Arc<SpaceDb>>, ApiError> {
        let mut spaces = lock(&self.spaces)?;
        if let Some(space) = spaces.get(&id) {
            return Ok(Some(Arc::clone(space)));
        }
        let path = self.space_path(id);
        if !path.exists() {
            return Ok(None);
        }
        let space = Arc::new(SpaceDb::open(&path)?);
        spaces.insert(id, Arc::clone(&space));
        Ok(Some(space))
    }

    pub(crate) fn create_space_db(&self, id: Uuid, epoch: Uuid, now_ms: u64) -> Result<(), ApiError> {
        let space = SpaceDb::open(&self.space_path(id))?;
        let mut conn = lock(&space.writer)?;
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO space (id, space_id, epoch, created_at) VALUES (1, ?1, ?2, ?3)",
            params![id, epoch, now_ms],
        )?;
        for kind in Kind::ALL {
            tx.execute(
                "INSERT INTO write_schema (kind, schema) VALUES (?1, ?2)",
                params![kind.as_wire(), SCHEMA],
            )?;
        }
        tx.commit()?;
        drop(conn);
        lock(&self.spaces)?.insert(id, Arc::new(space));
        Ok(())
    }

    /// Sets the only schema the space accepts for `kind` (`PROTOCOL.md` §Schema versions).
    pub fn set_write_schema(&self, space: Uuid, kind: Kind, schema: u32) -> Result<(), ApiError> {
        let space = self.space(space)?.ok_or_else(ApiError::unknown_space)?;
        lock(&space.writer)?.execute(
            "UPDATE write_schema SET schema = ?1 WHERE kind = ?2",
            params![schema, kind.as_wire()],
        )?;
        Ok(())
    }

    /// Raises the space's `write_schema` for `kind` by one version, once every active device has advertised it;
    /// `koloda-server write-schema` runs it beside `serve` (`PROTOCOL.md` §Schema versions).
    pub fn raise_write_schema(&self, space: Uuid, kind: Kind, schema: u32) -> Result<(), ApiError> {
        let db = self.space(space)?.ok_or_else(ApiError::unknown_space)?;
        let current: u32 = lock(&db.reader)?.query_row(
            "SELECT schema FROM write_schema WHERE kind = ?1",
            params![kind.as_wire()],
            |row| row.get(0),
        )?;
        if schema.checked_sub(1) != Some(current) {
            return Err(ApiError::bad_request(format!(
                "`{}` is at schema {current}; a raise goes to {} only",
                kind.as_wire(),
                u64::from(current) + 1
            )));
        }
        let behind: Vec<String> = devices::active(&*self.server_db()?, space, self.now_ms())?
            .into_iter()
            .filter(|device| {
                let advertised = device
                    .schemas
                    .as_deref()
                    .and_then(|text| decode_schemas(text).ok())
                    .and_then(|schemas| schemas.get(kind.as_wire()).copied());
                advertised.unwrap_or(0) < schema
            })
            .map(|device| device.name)
            .collect();
        if !behind.is_empty() {
            return Err(ApiError::bad_request(format!(
                "these active devices have not advertised schema {schema} for `{}`: {}",
                kind.as_wire(),
                behind.join(", ")
            )));
        }
        self.set_write_schema(space, kind, schema)
    }

    /// Runs one collection pass over every space: tombstones every active device has passed, then attachments no
    /// card has linked for 90 days (`PROTOCOL.md` §Pull cursor, §Attachments); `serve` runs one every hour.
    pub fn collect_garbage(&self) -> Result<(), ApiError> {
        let spaces = {
            let conn = self.server_db()?;
            let mut statement = conn.prepare("SELECT id FROM spaces")?;
            let spaces = statement
                .query_map([], |row| row.get::<_, Uuid>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            spaces
        };
        for space in spaces {
            self.collect_tombstones(space)?;
            attachments::collect(self, space)?;
        }
        Ok(())
    }

    // INVARIANT: device cursors are read before the space lock. Cursors only rise, so an earlier read keeps more; a
    // device enrolled meanwhile bootstraps from a snapshot and catches up from its lease's head.
    fn collect_tombstones(&self, id: Uuid) -> Result<(), ApiError> {
        let now = self.now_ms();
        let device_floor = devices::lowest_active_cursor(&*self.server_db()?, id, now)?;
        let space = self.space(id)?.ok_or_else(ApiError::unknown_space)?;
        let mut conn = lock(&space.writer)?;
        let tx = conn.transaction()?;
        bootstrap::end_expired(&tx, now)?;
        log::collect_tombstones(&tx, device_floor)?;
        tx.commit()?;
        Ok(())
    }

    pub(crate) fn space_epoch(&self, id: Uuid) -> Result<Uuid, ApiError> {
        let space = self.space(id)?.ok_or_else(ApiError::unknown_space)?;
        let epoch = lock(&space.reader)?.query_row("SELECT epoch FROM space WHERE id = 1", [], |row| row.get(0))?;
        Ok(epoch)
    }

    fn space_path(&self, id: Uuid) -> PathBuf {
        self.generation.join(SPACES).join(format!("{id}.db"))
    }

    pub(crate) fn attachments_dir(&self, space: Uuid) -> PathBuf {
        self.generation.join(ATTACHMENTS).join(space.to_string())
    }
}

impl SpaceDb {
    fn open(path: &Path) -> Result<SpaceDb, DbError> {
        let writer = db::open_space(path)?;
        Ok(SpaceDb {
            writer: Mutex::new(writer),
            reader: Mutex::new(db::open_reader(path)?),
        })
    }
}

pub(crate) fn lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, ApiError> {
    mutex.lock().map_err(|error| ApiError::internal(error.to_string()))
}

impl From<DbError> for ApiError {
    fn from(error: DbError) -> Self {
        ApiError::internal(error.to_string())
    }
}
