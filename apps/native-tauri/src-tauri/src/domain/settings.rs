use std::str::FromStr;

use rusqlite::types::{FromSql, FromSqlResult, ValueRef};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use strum_macros::{Display, EnumString};

use crate::app::error::{error_codes, AppError};
use crate::domain::settings_hotkeys::HotkeysSettings;
use crate::domain::settings_interface::InterfaceSettings;
use crate::domain::settings_learning::LearningSettings;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Display, EnumString, Serialize, Deserialize)]
#[strum(serialize_all = "kebab_case")]
#[serde(rename_all = "kebab-case")]
pub enum SettingsName {
    Interface,
    Learning,
    Hotkeys,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub id: i64,
    pub name: SettingsName,
    pub content: Value,
    pub created_at: i64,
    pub updated_at: Option<i64>,
}

impl FromSql for SettingsName {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        match value {
            ValueRef::Text(text) => Self::from_str(
                std::str::from_utf8(text).map_err(|e| rusqlite::types::FromSqlError::Other(Box::new(e)))?,
            )
            .map_err(|_| rusqlite::types::FromSqlError::InvalidType),
            _ => Err(rusqlite::types::FromSqlError::InvalidType),
        }
    }
}

impl TryFrom<String> for SettingsName {
    type Error = AppError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse::<SettingsName>().map_err(|_| {
            AppError::new(
                error_codes::DB_UPDATE,
                Some(format!("Invalid settings name: {}", value)),
            )
        })
    }
}

impl SettingsName {
    pub fn validate(&self, content: &Value) -> Result<(), AppError> {
        match self {
            SettingsName::Interface => {
                let settings: InterfaceSettings = serde_json::from_value(content.clone())?;
                settings.validate()
            }
            SettingsName::Learning => {
                let settings: LearningSettings = serde_json::from_value(content.clone())?;
                settings.validate()
            }
            SettingsName::Hotkeys => {
                let settings: HotkeysSettings = serde_json::from_value(content.clone())?;
                settings.validate()
            }
        }
    }
}
