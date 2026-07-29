use serde::Deserialize;
use serde_json::Value;

use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::app::utility::get_current_timestamp;
use crate::domain::algorithms::InsertAlgorithmData;
use crate::domain::settings::SettingsName;
use crate::domain::settings_learning::LearningSettings;
use crate::domain::templates::InsertTemplateData;
use crate::repo::{algorithms, settings, templates};

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

pub fn get_db_status(db: &Database) -> Result<DbStatus, AppError> {
    let settings_names = get_settings_names(db)?;

    if settings_names.is_empty() {
        Ok(DbStatus::Blank)
    } else {
        Ok(DbStatus::Ok)
    }
}

pub fn seed_db(db: &Database, data: SeedData) -> Result<(), AppError> {
    seed_db_impl(db, data)
}

fn seed_db_impl(db: &Database, data: SeedData) -> Result<(), AppError> {
    data.algorithm.validate()?;
    data.template.validate()?;

    let interface = SettingsName::Interface.normalize(data.settings.interface)?;
    let hotkeys = SettingsName::Hotkeys.normalize(data.settings.hotkeys)?;
    let now = get_current_timestamp()?;
    let mut learning_settings: LearningSettings = serde_json::from_value(data.settings.learning).map_err(|e| {
        AppError::new(
            error_codes::VALIDATION_SEED_LEARNING_SETTINGS,
            Some(format!("learning settings must be valid LearningSettings JSON: {e}")),
        )
    })?;

    db.with_transaction(|tx| {
        let algorithm_id = match algorithms::oldest_algorithm_id(tx)? {
            Some(id) => id,
            None => algorithms::insert_algorithm(tx, &data.algorithm, now)?,
        };

        let template_id = match templates::oldest_template_id(tx)? {
            Some(id) => id,
            None => templates::insert_template(tx, &data.template, now)?,
        };

        learning_settings.defaults.algorithm = algorithm_id;
        learning_settings.defaults.template = template_id;

        let learning = SettingsName::Learning.normalize(serde_json::to_value(&learning_settings)?)?;

        settings::upsert_settings(tx, SettingsName::Interface, &interface, now)?;
        settings::upsert_settings(tx, SettingsName::Learning, &learning, now)?;
        settings::upsert_settings(tx, SettingsName::Hotkeys, &hotkeys, now)?;

        Ok(())
    })
}

fn get_settings_names(db: &Database) -> Result<Vec<String>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT name FROM settings")?;
            let names = stmt
                .query_map([], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(names)
        })
    })
}
