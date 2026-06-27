use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use serde_json::Value;

use crate::app::db::Database;
use crate::app::error::AppError;
use crate::app::utility::{deserialize_optional_timestamp, get_current_timestamp};
use crate::domain::conversations::Conversation;

fn get_conversation_row(row: &rusqlite::Row<'_>) -> Result<Conversation, rusqlite::Error> {
    let state_str: String = row.get(1)?;
    let state = serde_json::from_str(&state_str)
        .map_err(|e| rusqlite::Error::FromSqlConversionFailure(1, rusqlite::types::Type::Text, Box::new(e)))?;

    Ok(Conversation {
        id: row.get(0)?,
        state,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

pub fn get_conversation(db: &Database, id: &str) -> Result<Option<Conversation>, AppError> {
    db.with_conn(|conn| {
        conn.query_row(
            r#"
            SELECT id, state, created_at, updated_at
            FROM conversations
            WHERE id = ?1
            LIMIT 1
            "#,
            params![id],
            get_conversation_row,
        )
        .optional()
        .map_err(AppError::from)
    })
}

pub fn get_conversations(db: &Database) -> Result<Vec<Conversation>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, state, created_at, updated_at
            FROM conversations
            ORDER BY updated_at DESC, created_at DESC
            "#,
        )?;

        let rows = stmt.query_map([], get_conversation_row)?;
        let mut conversations = Vec::new();
        for row in rows {
            conversations.push(row?);
        }
        Ok(conversations)
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetConversationInput {
    pub id: String,
    pub state: Value,
    #[serde(default, deserialize_with = "deserialize_optional_timestamp")]
    pub updated_at: Option<i64>,
}

pub fn set_conversation(db: &Database, input: SetConversationInput) -> Result<Conversation, AppError> {
    let now = get_current_timestamp()?;

    db.with_conn(|conn| {
        conn.execute(
            r#"
            INSERT INTO conversations (id, state, created_at, updated_at)
            VALUES (?1, ?2, ?3, NULL)
            ON CONFLICT(id) DO UPDATE SET
                state = excluded.state,
                updated_at = COALESCE(?4, ?5)
            "#,
            params![input.id, input.state.to_string(), now, input.updated_at, now],
        )?;
        Ok(())
    })?;

    get_conversation(db, &input.id)?.ok_or_else(|| AppError::new(crate::app::error::error_codes::DB_UPDATE, None))
}

pub fn delete_conversation(db: &Database, id: &str) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])?;
        Ok(())
    })
}
