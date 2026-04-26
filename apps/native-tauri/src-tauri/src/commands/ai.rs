use tauri::command;
use serde::Deserialize;

use crate::{
    app::db::DB,
    app::codex::run_codex_prompt,
    app::error::AppError,
    domain::ai::{AddProfileData, RemoveProfileData, TouchProfileData, UpdateProfileData},
    domain::settings_ai::AIProfile,
    repo::ai as repo,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexGenerateCardsData {
    pub prompt: String,
    pub model_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexChatData {
    pub prompt: String,
    pub model_id: Option<String>,
}

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

#[command]
pub fn cmd_generate_cards_with_codex(data: CodexGenerateCardsData) -> Result<String, AppError> {
    run_codex_prompt(&data.prompt, data.model_id.as_deref())
}

#[command]
pub fn cmd_chat_with_codex(data: CodexChatData) -> Result<String, AppError> {
    run_codex_prompt(&data.prompt, data.model_id.as_deref())
}
