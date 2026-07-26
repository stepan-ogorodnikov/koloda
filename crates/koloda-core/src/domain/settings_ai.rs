use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::app::error::{error_codes, AppError};

pub use crate::domain::ai::{AIProfile, AISecrets};

/// Accepted `assistant.temperature` range. Covers the common bounds of the
/// supported providers (openrouter, ollama, lmstudio, opencodeGo/Zen); adjust
/// here if a provider legitimately needs a wider range.
const ASSISTANT_TEMPERATURE_RANGE: std::ops::RangeInclusive<f64> = 0.0..=2.0;

/// Default value for `assistant.temperature`, applied by serde when the field is
/// omitted (mirrors the TS schema's `.default(0.2)` so the two backends accept
/// identical input). Note: an explicit `null` still fails deserialization, same
/// as zod's `z.number()`.
fn default_assistant_temperature() -> f64 {
    0.2
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantSettings {
    #[serde(default = "default_assistant_temperature")]
    pub temperature: f64,
    pub cards_prompt_template: Option<String>,
    pub chat_prompt_template: Option<String>,
}

impl Default for AssistantSettings {
    fn default() -> Self {
        Self {
            temperature: 0.2,
            cards_prompt_template: None,
            chat_prompt_template: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AISettings {
    pub profiles: Vec<AIProfile>,
    #[serde(default)]
    pub assistant: Option<AssistantSettings>,
}

impl AISettings {
    pub fn validate(&self) -> Result<(), AppError> {
        self.validate_for_storage()
    }

    pub fn validate_for_input(&self) -> Result<(), AppError> {
        for profile in &self.profiles {
            profile.validate_for_input()?;
        }

        self.validate_invariants()
    }

    pub fn validate_for_storage(&self) -> Result<(), AppError> {
        for profile in &self.profiles {
            profile.validate_for_storage()?;
        }

        self.validate_invariants()
    }

    /// Cross-profile invariants that apply in both input and storage contexts:
    /// profile ids must be unique (otherwise `position`/`retain` lookups would
    /// silently match the first duplicate), and `assistant.temperature` must be
    /// finite and within the accepted range.
    fn validate_invariants(&self) -> Result<(), AppError> {
        let mut seen: HashSet<&str> = HashSet::with_capacity(self.profiles.len());
        for profile in &self.profiles {
            if !seen.insert(profile.id.as_str()) {
                return Err(AppError::new(
                    error_codes::VALIDATION_AI_PROVIDERS_PROFILE_ID_DUPLICATE,
                    Some(format!("Duplicate AI profile id: {}", profile.id)),
                ));
            }
        }

        self.validate_assistant()
    }

    /// Validates `assistant.temperature`: must be finite and within the accepted
    /// range.
    fn validate_assistant(&self) -> Result<(), AppError> {
        if let Some(assistant) = &self.assistant {
            let temp = assistant.temperature;
            if !temp.is_finite() {
                return Err(AppError::new(
                    error_codes::VALIDATION_ASSISTANT_SETTINGS_TEMPERATURE_RANGE,
                    Some(format!("Assistant temperature must be finite: {}", temp)),
                ));
            }
            if !ASSISTANT_TEMPERATURE_RANGE.contains(&temp) {
                return Err(AppError::new(
                    error_codes::VALIDATION_ASSISTANT_SETTINGS_TEMPERATURE_RANGE,
                    Some(format!(
                        "Assistant temperature out of range ({}..={}): {}",
                        ASSISTANT_TEMPERATURE_RANGE.start(),
                        ASSISTANT_TEMPERATURE_RANGE.end(),
                        temp
                    )),
                ));
            }
        }

        Ok(())
    }
}
