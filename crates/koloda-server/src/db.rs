//! SQLite connections and the two embedded migration series: `server.db` and one database per space.
//!
//! `embed_migrations!` snapshots each directory at compile time; touch this file after adding a `V` file.

use std::fmt;
use std::path::Path;
use std::time::Duration;

use refinery::Runner;
use rusqlite::{Connection, OpenFlags};

mod server_migrations {
    use refinery::embed_migrations;
    embed_migrations!("src/migrations/server");
}

mod space_migrations {
    use refinery::embed_migrations;
    embed_migrations!("src/migrations/space");
}

const MIGRATIONS_TABLE: &str = "_migrations";
const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug)]
pub enum DbError {
    Sqlite(rusqlite::Error),
    Migration(refinery::Error),
}

pub(crate) fn open_server(path: &Path) -> Result<Connection, DbError> {
    open(path, server_migrations::migrations::runner())
}

pub(crate) fn open_space(path: &Path) -> Result<Connection, DbError> {
    open(path, space_migrations::migrations::runner())
}

// INVARIANT: open readers only after `open_space` has migrated the file; a reader never migrates.
pub(crate) fn open_reader(path: &Path) -> Result<Connection, DbError> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
    conn.busy_timeout(BUSY_TIMEOUT)?;
    Ok(conn)
}

fn open(path: &Path, mut runner: Runner) -> Result<Connection, DbError> {
    let mut conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.busy_timeout(BUSY_TIMEOUT)?;
    runner.set_migration_table_name(MIGRATIONS_TABLE);
    runner.run(&mut conn).map_err(DbError::Migration)?;
    Ok(conn)
}

impl From<rusqlite::Error> for DbError {
    fn from(error: rusqlite::Error) -> Self {
        DbError::Sqlite(error)
    }
}

impl fmt::Display for DbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DbError::Sqlite(error) => write!(f, "sqlite: {error}"),
            DbError::Migration(error) => write!(f, "migration: {error}"),
        }
    }
}

impl std::error::Error for DbError {}
