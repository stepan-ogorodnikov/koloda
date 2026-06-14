use serde_json::Value;
use tauri::command;

use crate::{app::db::DB, app::error::AppError, domain::conversations::Conversation, repo::conversations as repo};

#[command]
pub fn cmd_get_conversation(db: DB<'_>, id: String) -> Result<Option<Conversation>, AppError> {
    repo::get_conversation(&db, &id)
}

#[command]
pub fn cmd_get_conversations(db: DB<'_>) -> Result<Vec<Conversation>, AppError> {
    repo::get_conversations(&db)
}

#[command]
pub fn cmd_set_conversation(db: DB<'_>, id: String, state: Value) -> Result<Conversation, AppError> {
    repo::set_conversation(&db, &id, state)
}
