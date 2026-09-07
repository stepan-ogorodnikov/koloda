use std::str::FromStr;

use rusqlite::types::{FromSql, FromSqlResult, ValueRef};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use crate::app::db::{parse_json_column, Database};
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::app::utility::get_current_timestamp;
use crate::domain::settings::{Settings, SettingsName};

impl FromSql for SettingsName {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        match value {
            ValueRef::Text(text) => Self::from_str(
                std::str::from_utf8(text).map_err(|e| rusqlite::types::FromSqlError::Other(Box::new(e)))?,
            )
            .map_err(|_parse_err| rusqlite::types::FromSqlError::InvalidType),
            _ => Err(rusqlite::types::FromSqlError::InvalidType),
        }
    }
}

fn get_settings_row(row: &rusqlite::Row<'_>) -> Result<Settings, rusqlite::Error> {
    let content_str: String = row.get(2)?;
    let content = parse_json_column(2, &content_str)?;

    Ok(Settings {
        id: row.get(0)?,
        name: row.get(1)?,
        content,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

pub fn get_settings(db: &Database, name: SettingsName) -> Result<Option<Settings>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
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
            .and_then(|settings| match settings {
                Some(mut settings) => {
                    settings.content = name.normalize(settings.content)?;
                    Ok(Some(settings))
                }
                None => Ok(None),
            })
        })
    })
}

pub fn set_settings(db: &Database, name: SettingsName, content: Value) -> Result<Settings, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        let content = name.normalize(content)?;
        let now = get_current_timestamp()?;

        db.with_conn(|conn| upsert_settings(conn, name, &content, now))?;

        get_settings(db, name)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))
    })
}

pub(crate) fn upsert_settings(
    conn: &Connection,
    name: SettingsName,
    content: &Value,
    now: i64,
) -> Result<(), AppError> {
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
}

pub fn patch_settings(db: &Database, name: SettingsName, patch: Value) -> Result<Settings, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        let existing = get_settings(db, name)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))?;
        let mut merged = existing.content.clone();
        json_patch::merge(&mut merged, &patch);
        let merged = name.normalize(merged)?;

        set_settings(db, name, merged)
    })
}
