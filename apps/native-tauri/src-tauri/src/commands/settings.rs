use serde_json::Value;
use tauri::command;

use crate::{
    app::db::DB,
    app::error::AppError,
    domain::settings::{Settings, SettingsName},
    repo::settings as repo,
};

#[command]
pub fn cmd_get_settings(db: DB<'_>, name: String) -> Result<Option<Settings>, AppError> {
    let name = SettingsName::try_from(name)?;
    repo::get_settings(&db, name)
}

#[command]
pub fn cmd_set_settings(db: DB<'_>, name: String, content: Value) -> Result<Settings, AppError> {
    let name = SettingsName::try_from(name)?;
    repo::set_settings(&db, name, content)
}

#[command]
pub fn cmd_patch_settings(db: DB<'_>, name: String, content: Value) -> Result<Settings, AppError> {
    let name = SettingsName::try_from(name)?;
    repo::patch_settings(&db, name, content)
}
