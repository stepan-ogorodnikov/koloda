use serde::{Deserialize, Serialize};
use tauri::command;

use crate::{
    app::db::DB,
    app::error::AppError,
    domain::settings_ai::{AIProfile, AISecrets},
    repo::ai as repo,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddProfileData {
    pub title: Option<String>,
    pub secrets: Option<AISecrets>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveProfileData {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TouchProfileData {
    pub id: String,
    pub model_id: Option<String>,
}

#[command]
pub fn cmd_add_ai_profile(db: DB<'_>, data: AddProfileData) -> Result<AIProfile, AppError> {
    repo::add_ai_profile(&db, data.title, data.secrets)
}

#[command]
pub fn cmd_get_ai_profiles(db: DB<'_>) -> Result<Vec<AIProfile>, AppError> {
    repo::get_ai_profiles(&db)
}

#[command]
pub fn cmd_remove_ai_profile(db: DB<'_>, data: RemoveProfileData) -> Result<(), AppError> {
    repo::remove_ai_profile(&db, &data.id)
}

#[command]
pub fn cmd_touch_ai_profile(db: DB<'_>, data: TouchProfileData) -> Result<(), AppError> {
    repo::touch_ai_profile(&db, &data.id, data.model_id)
}
