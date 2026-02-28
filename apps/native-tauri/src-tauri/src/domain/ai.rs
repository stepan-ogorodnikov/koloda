use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};

pub const AI_PROVIDERS: &[&str] = &["openrouter", "ollama", "lmstudio"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIProfile {
    pub id: String,
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secrets: Option<AISecrets>,
    pub last_used_model: Option<String>,
    pub created_at: String,
    pub last_used_at: Option<String>,
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
    },
    #[serde(rename = "lmstudio")]
    LmStudio {
        #[serde(rename = "baseUrl", alias = "base_url")]
        base_url: String,
        #[serde(rename = "apiKey", alias = "api_key", skip_serializing_if = "Option::is_none")]
        api_key: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeySecret {
    pub api_key: String,
}

impl AISecrets {
    pub fn provider(&self) -> &'static str {
        match self {
            AISecrets::OpenRouter { .. } => "openrouter",
            AISecrets::Ollama { .. } => "ollama",
            AISecrets::LmStudio { .. } => "lmstudio",
        }
    }

    pub fn api_key(&self) -> Option<&str> {
        match self {
            AISecrets::OpenRouter { api_key } => Some(api_key),
            AISecrets::Ollama { .. } => None,
            AISecrets::LmStudio { api_key, .. } => api_key.as_deref(),
        }
    }

    pub fn validate(&self) -> Result<(), AppError> {
        self.validate_for_input()
    }

    pub fn validate_for_input(&self) -> Result<(), AppError> {
        match self {
            AISecrets::OpenRouter { api_key } => {
                if api_key.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_AI_PROVIDERS_PROVIDER,
                        Some("openrouter.apiKey is required".to_string()),
                    ));
                }
            }
            AISecrets::Ollama { base_url } => {
                if base_url.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_AI_PROVIDERS_PROVIDER,
                        Some("ollama.baseUrl is required".to_string()),
                    ));
                }
            }
            AISecrets::LmStudio { base_url, .. } => {
                if base_url.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_AI_PROVIDERS_PROVIDER,
                        Some("lmstudio.baseUrl is required".to_string()),
                    ));
                }
            }
        }

        Ok(())
    }

    pub fn validate_for_storage(&self) -> Result<(), AppError> {
        match self {
            AISecrets::OpenRouter { api_key } => {
                if !api_key.is_empty() && api_key.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_AI_PROVIDERS_PROVIDER,
                        Some("openrouter.apiKey cannot be whitespace only".to_string()),
                    ));
                }
            }
            AISecrets::Ollama { base_url } => {
                if !base_url.is_empty() && base_url.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_AI_PROVIDERS_PROVIDER,
                        Some("ollama.baseUrl cannot be whitespace only".to_string()),
                    ));
                }
            }
            AISecrets::LmStudio { base_url, .. } => {
                if !base_url.is_empty() && base_url.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_AI_PROVIDERS_PROVIDER,
                        Some("lmstudio.baseUrl cannot be whitespace only".to_string()),
                    ));
                }
            }
        }

        Ok(())
    }
}

impl AIProfile {
    pub fn validate(&self) -> Result<(), AppError> {
        self.validate_for_storage()
    }

    pub fn validate_for_input(&self) -> Result<(), AppError> {
        if self.id.is_empty() {
            return Err(AppError::new(error_codes::VALIDATION_AI_PROVIDERS_PROVIDER, None));
        }

        if let Some(title) = &self.title {
            if title.len() > 128 {
                return Err(AppError::new(error_codes::VALIDATION_AI_PROVIDERS_TITLE, None));
            }
        }

        if let Some(secrets) = &self.secrets {
            secrets.validate_for_input()?;
        }

        Ok(())
    }

    pub fn validate_for_storage(&self) -> Result<(), AppError> {
        if self.id.is_empty() {
            return Err(AppError::new(error_codes::VALIDATION_AI_PROVIDERS_PROVIDER, None));
        }

        if let Some(title) = &self.title {
            if title.len() > 128 {
                return Err(AppError::new(error_codes::VALIDATION_AI_PROVIDERS_TITLE, None));
            }
        }

        if let Some(secrets) = &self.secrets {
            secrets.validate_for_storage()?;
        }

        Ok(())
    }
}
