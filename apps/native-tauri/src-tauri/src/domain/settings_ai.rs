use serde::{Deserialize, Serialize};

pub use crate::domain::ai::{AIProfile, AISecrets};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AISettings {
    pub profiles: Vec<AIProfile>,
}

impl AISettings {
    pub fn validate(&self) -> Result<(), crate::app::error::AppError> {
        for profile in &self.profiles {
            profile.validate()?;
        }

        Ok(())
    }
}
