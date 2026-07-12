use crate::app::db::DB;
use koloda_core::app::db::Database;
use koloda_core::app::error::AppError;
use koloda_core::app::init::{self as core_init, DbStatus};
pub use koloda_core::app::init::{SeedData, SeedSettings};

#[tauri::command]
pub fn get_db_status(db: DB<'_>) -> Result<DbStatus, AppError> {
    core_init::get_db_status(&db)
}

#[tauri::command]
pub fn seed_db(db: DB<'_>, data: SeedData) -> Result<(), AppError> {
    core_init::seed_db(&db, data)
}

pub fn seed_db_with_database(db: &Database, data: SeedData) -> Result<(), AppError> {
    core_init::seed_db(db, data)
}
