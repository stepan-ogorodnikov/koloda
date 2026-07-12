use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};

pub const LANGUAGES: &[&str] = &["en", "ru"];
pub const SCHEMES: &[&str] = &["light", "dark", "system"];
pub const LIGHT_THEMES: &[&str] = &["atom-one-light"];
pub const DARK_THEMES: &[&str] = &["atom-one-dark"];
pub const MOTION_SETTINGS: &[&str] = &["on", "off", "system"];

fn default_light_theme() -> String {
    "atom-one-light".to_string()
}

fn default_dark_theme() -> String {
    "atom-one-dark".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceSettings {
    pub language: String,
    pub scheme: String,
    #[serde(default = "default_light_theme")]
    pub light_theme: String,
    #[serde(default = "default_dark_theme")]
    pub dark_theme: String,
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

        if !SCHEMES.contains(&self.scheme.as_str()) {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_INTERFACE_SCHEME,
                Some(format!("Invalid scheme: {}", self.scheme)),
            ));
        }

        if !LIGHT_THEMES.contains(&self.light_theme.as_str()) {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_INTERFACE_LIGHT_THEME,
                Some(format!("Invalid light theme: {}", self.light_theme)),
            ));
        }

        if !DARK_THEMES.contains(&self.dark_theme.as_str()) {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_INTERFACE_DARK_THEME,
                Some(format!("Invalid dark theme: {}", self.dark_theme)),
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
