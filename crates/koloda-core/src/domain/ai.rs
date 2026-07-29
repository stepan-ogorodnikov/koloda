use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};
use crate::domain::time::{deserialize_timestamp, serialize_timestamp};

pub const AI_PROVIDERS: &[&str] = &["openrouter", "ollama", "lmstudio", "opencodeGo", "opencodeZen"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIProfile {
    pub id: String,
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secrets: Option<AISecrets>,
    #[serde(serialize_with = "serialize_timestamp", deserialize_with = "deserialize_timestamp")]
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "provider", rename_all = "camelCase")]
pub enum AISecrets {
    #[serde(rename = "openrouter")]
    OpenRouter {
        #[serde(rename = "apiKey", alias = "api_key")]
        api_key: String,
    },
    #[serde(rename = "ollama")]
    Ollama {
        #[serde(rename = "baseUrl", alias = "base_url")]
        base_url: String,
        #[serde(rename = "apiKey", alias = "api_key", skip_serializing_if = "Option::is_none")]
        api_key: Option<String>,
    },
    #[serde(rename = "lmstudio")]
    LmStudio {
        #[serde(rename = "baseUrl", alias = "base_url")]
        base_url: String,
        #[serde(rename = "apiKey", alias = "api_key", skip_serializing_if = "Option::is_none")]
        api_key: Option<String>,
    },
    #[serde(rename = "opencodeGo")]
    OpencodeGo {
        #[serde(rename = "apiKey", alias = "api_key")]
        api_key: String,
    },
    #[serde(rename = "opencodeZen")]
    OpencodeZen {
        #[serde(rename = "apiKey", alias = "api_key")]
        api_key: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeySecret {
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddProfileData {
    pub title: Option<String>,
    pub secrets: Option<AISecrets>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileData {
    pub id: String,
    pub title: Option<String>,
    pub secrets: Option<AISecrets>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveProfileData {
    pub id: String,
}

impl AISecrets {
    pub fn provider(&self) -> &'static str {
        match self {
            AISecrets::OpenRouter { .. } => "openrouter",
            AISecrets::Ollama { .. } => "ollama",
            AISecrets::LmStudio { .. } => "lmstudio",
            AISecrets::OpencodeGo { .. } => "opencodeGo",
            AISecrets::OpencodeZen { .. } => "opencodeZen",
        }
    }

    pub fn api_key(&self) -> Option<&str> {
        match self {
            AISecrets::OpenRouter { api_key } => Some(api_key),
            AISecrets::Ollama { api_key, .. } => api_key.as_deref(),
            AISecrets::LmStudio { api_key, .. } => api_key.as_deref(),
            AISecrets::OpencodeGo { api_key } => Some(api_key),
            AISecrets::OpencodeZen { api_key } => Some(api_key),
        }
    }

    // WHY: `validate` on secrets is input-strict (full values). Do not retarget to storage rules.
    pub fn validate(&self) -> Result<(), AppError> {
        self.validate_for_input()
    }

    pub fn validate_for_input(&self) -> Result<(), AppError> {
        match self {
            AISecrets::OpenRouter { api_key } => {
                if api_key.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_API_KEY,
                        Some("openrouter.apiKey is required".to_string()),
                    ));
                }
            }
            AISecrets::Ollama { base_url, .. } => {
                if base_url.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_BASE_URL,
                        Some("ollama.baseUrl is required".to_string()),
                    ));
                }
            }
            AISecrets::LmStudio { base_url, .. } => {
                if base_url.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_BASE_URL,
                        Some("lmstudio.baseUrl is required".to_string()),
                    ));
                }
            }
            AISecrets::OpencodeGo { api_key } => {
                if api_key.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_API_KEY,
                        Some("opencodeGo.apiKey is required".to_string()),
                    ));
                }
            }
            AISecrets::OpencodeZen { api_key } => {
                if api_key.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_API_KEY,
                        Some("opencodeZen.apiKey is required".to_string()),
                    ));
                }
            }
        }

        Ok(())
    }

    // INVARIANT: The settings JSON must hold only the redacted form. Real API
    // keys are persisted through the OS keyring, so a non-empty `api_key` here
    // means plaintext is about to leak into the `settings` table — reject it.
    pub fn validate_for_storage(&self) -> Result<(), AppError> {
        match self {
            AISecrets::OpenRouter { api_key } => {
                if !api_key.is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_API_KEY,
                        Some("openrouter.apiKey must not be stored in settings".to_string()),
                    ));
                }
            }
            AISecrets::Ollama { base_url, api_key } => {
                if !base_url.is_empty() && base_url.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_BASE_URL,
                        Some("ollama.baseUrl cannot be whitespace only".to_string()),
                    ));
                }
                if api_key.as_ref().is_some_and(|key| !key.is_empty()) {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_API_KEY,
                        Some("ollama.apiKey must not be stored in settings".to_string()),
                    ));
                }
            }
            AISecrets::LmStudio { base_url, api_key } => {
                if !base_url.is_empty() && base_url.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_BASE_URL,
                        Some("lmstudio.baseUrl cannot be whitespace only".to_string()),
                    ));
                }
                if api_key.as_ref().is_some_and(|key| !key.is_empty()) {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_API_KEY,
                        Some("lmstudio.apiKey must not be stored in settings".to_string()),
                    ));
                }
            }
            AISecrets::OpencodeGo { api_key } => {
                if !api_key.is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_API_KEY,
                        Some("opencodeGo.apiKey must not be stored in settings".to_string()),
                    ));
                }
            }
            AISecrets::OpencodeZen { api_key } => {
                if !api_key.is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_API_KEY,
                        Some("opencodeZen.apiKey must not be stored in settings".to_string()),
                    ));
                }
            }
        }

        Ok(())
    }
}

impl AIProfile {
    // WHY: `validate` on profiles is storage-lenient (redacted OK). Do not retarget to input rules.
    pub fn validate(&self) -> Result<(), AppError> {
        self.validate_for_storage()
    }

    pub fn validate_for_input(&self) -> Result<(), AppError> {
        if self.id.is_empty() {
            return Err(AppError::new(error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_ID, None));
        }

        if let Some(title) = &self.title {
            if title.len() > 128 {
                return Err(AppError::new(error_codes::VALIDATION_COMMON_TITLE_TOO_LONG, None));
            }
        }

        if let Some(secrets) = &self.secrets {
            secrets.validate_for_input()?;
        }

        Ok(())
    }

    pub fn validate_for_storage(&self) -> Result<(), AppError> {
        if self.id.is_empty() {
            return Err(AppError::new(error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_ID, None));
        }

        if let Some(title) = &self.title {
            if title.len() > 128 {
                return Err(AppError::new(error_codes::VALIDATION_COMMON_TITLE_TOO_LONG, None));
            }
        }

        if let Some(secrets) = &self.secrets {
            secrets.validate_for_storage()?;
        }

        Ok(())
    }
}
