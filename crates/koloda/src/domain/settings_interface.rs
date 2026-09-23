//! `settings.interface` slice — mirrors `@koloda/app` interface/theme preferences.
//!
//! Missing-field defaults mirror the TS `.default()`s: `language` "en",
//! `scheme` "system", `lightTheme` "github-light", `darkTheme` "github-dark",
//! `motion` "system", `dateFormat` "locale", `timeFormat` "locale" —
//! same convention as the learning slice.

use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};

pub const LANGUAGES: &[&str] = &["en", "ru"];
pub const SCHEMES: &[&str] = &["light", "dark", "system"];
pub const LIGHT_THEMES: &[&str] = &["atom-one-light", "github-light"];
pub const DARK_THEMES: &[&str] = &["atom-one-dark", "github-dark"];
pub const MOTION_SETTINGS: &[&str] = &["on", "off", "system"];

const TIMESTAMP_PATTERN_MAX_LENGTH: usize = 64;
const TIMESTAMP_PATTERN_TOKENS: &[u8] = b"yMdHhmsa";

fn default_language() -> String {
    "en".to_string()
}

fn default_scheme() -> String {
    "system".to_string()
}

fn default_light_theme() -> String {
    "github-light".to_string()
}

fn default_dark_theme() -> String {
    "github-dark".to_string()
}

fn default_motion() -> String {
    "system".to_string()
}

fn default_date_format() -> String {
    "locale".to_string()
}

fn default_time_format() -> String {
    "locale".to_string()
}

// WHY: the scan must stay in step with the TS twin (`isValidTimestampPattern` in
// `libs/app/src/lib/settings-interface.ts`) — same letter whitelist, quote rules, and
// length cap. "locale" is the sentinel, not a pattern, so it bypasses the scan; date-fns
// escapes literals with single quotes (`'at'`, `''` for a real quote), so letters inside
// quotes never count as tokens. The TS side additionally probes with date-fns itself;
// this side stays structural so the crate never needs a pattern engine (ADR 0001).
fn is_valid_timestamp_pattern(value: &str) -> bool {
    if value == "locale" {
        return true;
    }

    if value.is_empty() || value.chars().count() > TIMESTAMP_PATTERN_MAX_LENGTH {
        return false;
    }

    let mut in_quote = false;
    let mut token_count = 0usize;
    let mut characters = value.chars().peekable();
    while let Some(character) = characters.next() {
        if character == '\'' {
            if characters.peek() == Some(&'\'') {
                characters.next();
                continue;
            }
            in_quote = !in_quote;
            continue;
        }
        if in_quote {
            continue;
        }
        if character.is_ascii_alphabetic() {
            if !TIMESTAMP_PATTERN_TOKENS.contains(&(character as u8)) {
                return false;
            }
            token_count += 1;
        }
    }
    token_count > 0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceSettings {
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_scheme")]
    pub scheme: String,
    #[serde(default = "default_light_theme")]
    pub light_theme: String,
    #[serde(default = "default_dark_theme")]
    pub dark_theme: String,
    #[serde(default = "default_motion")]
    pub motion: String,
    #[serde(default = "default_date_format")]
    pub date_format: String,
    #[serde(default = "default_time_format")]
    pub time_format: String,
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

        if !is_valid_timestamp_pattern(&self.date_format) {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_INTERFACE_DATE_FORMAT,
                Some(format!("Invalid date format: {}", self.date_format)),
            ));
        }

        if !is_valid_timestamp_pattern(&self.time_format) {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_INTERFACE_TIME_FORMAT,
                Some(format!("Invalid time format: {}", self.time_format)),
            ));
        }

        Ok(())
    }
}
