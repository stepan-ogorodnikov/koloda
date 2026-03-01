use tauri::command;

use crate::{
    app::db::DB,
    app::error::AppError,
    domain::ai::{AddProfileData, RemoveProfileData, TouchProfileData, UpdateProfileData},
    domain::settings_ai::AIProfile,
    repo::ai as repo,
};

#[command]
pub fn cmd_get_ai_profiles(db: DB<'_>) -> Result<Vec<AIProfile>, AppError> {
    repo::get_ai_profiles(&db)
}

#[command]
pub fn cmd_add_ai_profile(db: DB<'_>, data: AddProfileData) -> Result<AIProfile, AppError> {
    repo::add_ai_profile(&db, data.title, data.secrets)
}

#[command]
pub fn cmd_update_ai_profile(db: DB<'_>, data: UpdateProfileData) -> Result<AIProfile, AppError> {
    repo::update_ai_profile(&db, &data.id, data.title, data.secrets)
}

#[command]
pub fn cmd_remove_ai_profile(db: DB<'_>, data: RemoveProfileData) -> Result<(), AppError> {
    repo::remove_ai_profile(&db, &data.id)
}

#[command]
pub fn cmd_touch_ai_profile(db: DB<'_>, data: TouchProfileData) -> Result<(), AppError> {
    repo::touch_ai_profile(&db, &data.id, data.model_id)
}
