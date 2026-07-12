pub use koloda_core::app::db::Database;
use tauri::{AppHandle, Manager, State};

pub type DB<'a> = State<'a, Database>;

pub fn init_db(app_handle: &AppHandle) -> anyhow::Result<Database> {
    let app_data_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("koloda.db");
    Database::init(db_path).map_err(anyhow::Error::from)
}
