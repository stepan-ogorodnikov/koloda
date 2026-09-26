//! Settings table envelope — mirrors `@koloda/settings` `allowedSettings` / `SettingsName`.
//!
//! Slice schemas stay with their owners.
//! Interface, learning, and hotkeys live in `@koloda/app`; AI lives in `@koloda/ai`.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use strum_macros::{Display, EnumString};

use crate::app::error::AppError;
use crate::domain::settings_ai::AISettings;
use crate::domain::settings_hotkeys::HotkeysSettings;
use crate::domain::settings_interface::InterfaceSettings;
use crate::domain::settings_learning::LearningSettings;
use crate::domain::time::{
    deserialize_optional_timestamp, deserialize_timestamp, serialize_optional_timestamp, serialize_timestamp,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Display, EnumString, Serialize, Deserialize)]
#[strum(serialize_all = "kebab_case")]
#[serde(rename_all = "kebab-case")]
pub enum SettingsName {
    Interface,
    Learning,
    Hotkeys,
    Ai,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub id: i64,
    pub name: SettingsName,
    pub content: Value,
    // WHY: accepts the RFC 3339 string `serialize_timestamp` emits, so the wire shape
    // round-trips. Storage stays unix-ms integers (agents/DB.md); only the wire changes.
    #[serde(deserialize_with = "deserialize_timestamp", serialize_with = "serialize_timestamp")]
    pub created_at: i64,
    #[serde(
        default,
        deserialize_with = "deserialize_optional_timestamp",
        serialize_with = "serialize_optional_timestamp"
    )]
    pub updated_at: Option<i64>,
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
            SettingsName::Ai => {
                let settings: AISettings = serde_json::from_value(content.clone())?;
                settings.validate()
            }
        }
    }

    pub fn normalize(&self, content: Value) -> Result<Value, AppError> {
        match self {
            SettingsName::Interface => {
                let settings: InterfaceSettings = serde_json::from_value(content)?;
                settings.validate()?;
                Ok(serde_json::to_value(settings)?)
            }
            SettingsName::Learning => {
                let settings: LearningSettings = serde_json::from_value(content)?;
                settings.validate()?;
                Ok(serde_json::to_value(settings)?)
            }
            SettingsName::Hotkeys => {
                let mut settings: HotkeysSettings = serde_json::from_value(content)?;
                settings.fill_defaults();
                settings.validate()?;
                Ok(serde_json::to_value(settings)?)
            }
            SettingsName::Ai => {
                let settings: AISettings = serde_json::from_value(content)?;
                settings.validate()?;
                Ok(serde_json::to_value(settings)?)
            }
        }
    }
}
