use rusqlite::{params, OptionalExtension};
use serde_json::Value;

use crate::app::db::Database;
use crate::app::error::{error_codes, AppError};
use crate::app::utility::get_current_timestamp;
use crate::domain::settings::{Settings, SettingsName};

fn get_settings_row(row: &rusqlite::Row<'_>) -> Result<Settings, rusqlite::Error> {
    let content_str: String = row.get(2)?;
    let content = serde_json::from_str(&content_str)
        .map_err(|e| rusqlite::Error::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(e)))?;

    Ok(Settings {
        id: row.get(0)?,
        name: row.get(1)?,
        content,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

pub fn get_settings(db: &Database, name: SettingsName) -> Result<Option<Settings>, AppError> {
    db.with_conn(|conn| {
        conn.query_row(
            r#"
            SELECT id, name, content, created_at, updated_at
            FROM settings
            WHERE name = ?1
            LIMIT 1
            "#,
            params![name.to_string()],
            get_settings_row,
        )
        .optional()
        .map_err(AppError::from)
    })
}

pub fn set_settings(db: &Database, name: SettingsName, content: Value) -> Result<Settings, AppError> {
    // validation is skipped for AI cause it misfires in case some secrets are required, but not stored in db
    // TODO: find a better way
    if name != SettingsName::Ai {
        name.validate(&content)?;
    }
    let now = get_current_timestamp()?;

    db.with_conn(|conn| {
        conn.execute(
            r#"
            INSERT INTO settings (name, content, created_at, updated_at)
            VALUES (?1, ?2, ?3, NULL)
            ON CONFLICT(name) DO UPDATE SET
                content = excluded.content,
                updated_at = ?4
            "#,
            params![name.to_string(), content.to_string(), now, now],
        )?;
        Ok(())
    })?;

    get_settings(db, name)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))
}

pub fn patch_settings(db: &Database, name: SettingsName, patch: Value) -> Result<Settings, AppError> {
    let existing = get_settings(db, name)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))?;
    let mut merged = existing.content.clone();
    json_patch::merge(&mut merged, &patch);
    name.validate(&merged)?;

    set_settings(db, name, merged)
}
