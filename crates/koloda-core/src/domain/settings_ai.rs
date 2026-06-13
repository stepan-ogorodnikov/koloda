use serde::{Deserialize, Serialize};

pub use crate::domain::ai::{AIProfile, AISecrets};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantSettings {
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
    pub fn validate(&self) -> Result<(), crate::app::error::AppError> {
        self.validate_for_storage()
    }

    pub fn validate_for_input(&self) -> Result<(), crate::app::error::AppError> {
        for profile in &self.profiles {
            profile.validate_for_input()?;
        }

        Ok(())
    }

    pub fn validate_for_storage(&self) -> Result<(), crate::app::error::AppError> {
        for profile in &self.profiles {
            profile.validate_for_storage()?;
        }

        Ok(())
    }
}
