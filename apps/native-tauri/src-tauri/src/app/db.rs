use rusqlite::{Connection, Transaction};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, State};

use crate::app::error::AppError;
use crate::migrations;

pub type DB<'a> = State<'a, Database>;

pub const MIGRATIONS_TABLE: &str = "_migrations";
const DB_FILENAME: &str = "koloda.db";

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn init(app_handle: &AppHandle) -> Result<Self, AppError> {
        let db_path = get_db_path(app_handle)?;
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(AppError::from)?;
        }

        let mut conn = Connection::open(&db_path).map_err(AppError::from)?;

        conn.pragma_update(None, "journal_mode", "WAL").ok();
        conn.pragma_update(None, "foreign_keys", "ON").ok();

        migrations::runner().run(&mut conn).map_err(AppError::from)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn with_conn<T>(&self, f: impl FnOnce(&Connection) -> Result<T, AppError>) -> Result<T, AppError> {
        let guard = self.conn.lock().map_err(crate::app::error::from_db_lock_error)?;

        f(&guard)
    }

    pub fn with_transaction<T>(&self, f: impl FnOnce(&Transaction<'_>) -> Result<T, AppError>) -> Result<T, AppError> {
        let mut guard = self.conn.lock().map_err(crate::app::error::from_db_lock_error)?;
        let tx = guard.transaction().map_err(AppError::from)?;
        let result = f(&tx)?;
        tx.commit().map_err(AppError::from)?;

        Ok(result)
    }

    pub fn checkpoint(&self) -> Result<(), AppError> {
        let guard = self.conn.lock().map_err(crate::app::error::from_db_lock_error)?;
        guard.execute("PRAGMA wal_checkpoint(TRUNCATE)", [])?;

        Ok(())
    }
}

pub fn get_db_path(app_handle: &AppHandle) -> anyhow::Result<PathBuf> {
    let app_data_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;

    Ok(app_data_dir.join(DB_FILENAME))
}
