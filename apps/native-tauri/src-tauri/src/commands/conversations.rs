use serde::Deserialize;
use serde_json::Value;
use tauri::command;

use crate::{
    app::db::DB, app::error::AppError, app::utility::deserialize_optional_timestamp,
    domain::conversations::Conversation, repo::conversations as repo,
};

#[command]
pub fn cmd_get_conversation(db: DB<'_>, id: String) -> Result<Option<Conversation>, AppError> {
    repo::get_conversation(&db, &id)
}

#[command]
pub fn cmd_get_conversations(db: DB<'_>) -> Result<Vec<Conversation>, AppError> {
    repo::get_conversations(&db)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetConversationArgs {
    id: String,
    state: Value,
    #[serde(default, deserialize_with = "deserialize_optional_timestamp")]
    updated_at: Option<i64>,
}

#[command]
pub fn cmd_set_conversation(db: DB<'_>, args: SetConversationArgs) -> Result<Conversation, AppError> {
    repo::set_conversation(
        &db,
        repo::SetConversationInput {
            id: args.id,
            state: args.state,
            updated_at: args.updated_at,
        },
    )
}

#[command]
pub fn cmd_delete_conversation(db: DB<'_>, id: String) -> Result<(), AppError> {
    repo::delete_conversation(&db, &id)
}
