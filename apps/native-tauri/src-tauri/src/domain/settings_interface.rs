use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};

pub const LANGUAGES: &[&str] = &["en", "ru"];
pub const THEMES: &[&str] = &["light", "dark", "system"];
pub const MOTION_SETTINGS: &[&str] = &["on", "off", "system"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceSettings {
    pub language: String,
    pub theme: String,
    pub motion: String,
}

impl InterfaceSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        if !LANGUAGES.contains(&self.language.as_str()) {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_INTERFACE_LANGUAGE,
                Some(format!("Invalid language: {}", self.language)),
            ));
        }

        if !THEMES.contains(&self.theme.as_str()) {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_INTERFACE_THEME,
                Some(format!("Invalid theme: {}", self.theme)),
            ));
        }

        if !MOTION_SETTINGS.contains(&self.motion.as_str()) {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_INTERFACE_MOTION,
                Some(format!("Invalid motion setting: {}", self.motion)),
            ));
        }

        Ok(())
    }
}
