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
pub fn cmd_set_conversation(
    db: DB<'_>,
    id: String,
    state: Value,
    updated_at: Option<Value>,
) -> Result<Conversation, AppError> {
    let updated_at = match updated_at {
        Some(v) => Some(value_to_millis(v)?),
        None => None,
    };
    repo::set_conversation(&db, repo::SetConversationInput { id, state, updated_at })
}

#[command]
pub fn cmd_delete_conversation(db: DB<'_>, id: String) -> Result<(), AppError> {
    repo::delete_conversation(&db, &id)
}

fn value_to_millis(value: Value) -> Result<i64, AppError> {
    match value {
        Value::Number(n) => n.as_i64().ok_or_else(|| {
            AppError::new(
                crate::app::error::error_codes::UNKNOWN,
                Some("Invalid timestamp number".to_string()),
            )
        }),
        Value::String(s) => Ok(crate::app::utility::parse_iso_to_millis(&s)?),
        _ => Err(AppError::new(
            crate::app::error::error_codes::UNKNOWN,
            Some("updated_at must be a number or ISO string".to_string()),
        )),
    }
}
