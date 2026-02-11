use rusqlite::OptionalExtension;
use serde::Deserialize;
use serde_json::Value;

use crate::app::db::Database;
use crate::app::error::{error_codes, AppError};
use crate::domain::algorithms::InsertAlgorithmData;
use crate::domain::settings::SettingsName;
use crate::domain::templates::InsertTemplateData;
use crate::repo::algorithms::add_algorithm;
use crate::repo::settings::set_settings;
use crate::repo::templates::add_template;

#[derive(serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DbStatus {
    Blank,
    Ok,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedData {
    pub algorithm: InsertAlgorithmData,
    pub template: InsertTemplateData,
    pub settings: SeedSettings,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedSettings {
    pub interface: Value,
    pub learning: Value,
    pub hotkeys: Value,
}

#[tauri::command]
pub fn get_db_status(db: tauri::State<'_, Database>) -> Result<DbStatus, AppError> {
    let settings_names = get_settings_names(&db)?;

    if settings_names.is_empty() {
        Ok(DbStatus::Blank)
    } else {
        Ok(DbStatus::Ok)
    }
}

#[tauri::command]
pub fn seed_db(db: tauri::State<'_, Database>, data: SeedData) -> Result<(), AppError> {
    let algorithm_id = match get_oldest_algorithm_id(&db)? {
        Some(id) => id,
        None => add_algorithm(&db, data.algorithm)?.id,
    };

    let template_id = match get_oldest_template_id(&db)? {
        Some(id) => id,
        None => add_template(&db, data.template)?.id,
    };

    let mut learning_settings = data.settings.learning;
    if let Some(obj) = learning_settings.as_object_mut() {
        let defaults = obj.entry("defaults").or_insert_with(|| serde_json::json!({}));
        if let Some(defaults_obj) = defaults.as_object_mut() {
            defaults_obj.insert("algorithm".to_string(), serde_json::json!(algorithm_id));
            defaults_obj.insert("template".to_string(), serde_json::json!(template_id));
        }
    }

    set_settings(&db, SettingsName::Interface, data.settings.interface)?;
    set_settings(&db, SettingsName::Learning, learning_settings)?;
    set_settings(&db, SettingsName::Hotkeys, data.settings.hotkeys)?;

    Ok(())
}

fn get_settings_names(db: &Database) -> Result<Vec<String>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare("SELECT name FROM settings")
            .map_err(|e| AppError::new(error_codes::DB_GET, Some(e.to_string())))?;

        let names = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| AppError::new(error_codes::DB_GET, Some(e.to_string())))?
            .collect::<Result<Vec<String>, rusqlite::Error>>()
            .map_err(|e| AppError::new(error_codes::DB_GET, Some(e.to_string())))?;

        Ok(names)
    })
}

fn get_oldest_algorithm_id(db: &Database) -> Result<Option<i64>, AppError> {
    db.with_conn(|conn| {
        let id: Option<i64> = conn
            .query_row("SELECT id FROM algorithms ORDER BY created_at ASC LIMIT 1", [], |row| {
                row.get(0)
            })
            .optional()?;
        Ok(id)
    })
}

fn get_oldest_template_id(db: &Database) -> Result<Option<i64>, AppError> {
    db.with_conn(|conn| {
        let id: Option<i64> = conn
            .query_row("SELECT id FROM templates ORDER BY created_at ASC LIMIT 1", [], |row| {
                row.get(0)
            })
            .optional()?;
        Ok(id)
    })
}
