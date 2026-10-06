//! Shared state behind every handler: the active generation's `server.db`, open space databases, and the clock.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use koloda_sync_proto::payload::SCHEMA;
use koloda_sync_proto::registry::Kind;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::attachments;
use crate::clock::Clock;
use crate::data_dir::{self, DataDirError, ATTACHMENTS, SERVER_DB, SPACES};
use crate::db::{self, DbError};
use crate::http::ApiError;
use crate::pairing::Guesses;

pub struct Server {
    generation: PathBuf,
    server_db: Mutex<Connection>,
    spaces: Mutex<HashMap<Uuid, Arc<SpaceDb>>>,
    clock: Arc<dyn Clock>,
    pub(crate) guesses: Mutex<Guesses>,
}

// INVARIANT: every write to a space goes through `writer`, which is that space's writer lock
// (`PROTOCOL.md` §Topology and server state). Reads use `reader`, so they never wait for a write transaction.
pub(crate) struct SpaceDb {
    pub(crate) writer: Mutex<Connection>,
    pub(crate) reader: Mutex<Connection>,
}

impl Server {
    pub fn open(data_dir: &Path, clock: Arc<dyn Clock>) -> Result<Server, DataDirError> {
        let generation = data_dir::active_generation(data_dir)?;
        let server_db = db::open_server(&generation.join(SERVER_DB))?;
        Ok(Server {
            generation,
            server_db: Mutex::new(server_db),
            spaces: Mutex::new(HashMap::new()),
            clock,
            guesses: Mutex::new(Guesses::default()),
        })
    }

    pub(crate) fn now_ms(&self) -> u64 {
        self.clock.now_ms()
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

    /// Runs one collection pass over every space (`PROTOCOL.md` §Attachments); `serve` runs one every hour.
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
            attachments::collect(self, space)?;
        }
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
