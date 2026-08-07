//! AI profiles, provider secrets, and validation — mirrors `@koloda/ai` / `settings.ai`.
//!
//! Settings JSON stores redacted secrets (`apiKey: null`); real keys live in the keyring via `repo::ai`.

use serde::{Deserialize, Deserializer, Serialize};

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
    // WHY: Default so stored settings without the field still deserialize; hosts set
    // the real value when returning profiles (key may exist while `apiKey` is redacted).
    #[serde(default)]
    pub has_secrets: bool,
    #[serde(serialize_with = "serialize_timestamp", deserialize_with = "deserialize_timestamp")]
    pub created_at: i64,
}

// WHY: Settings JSON and IPC use `null` for redacted/absent keys. Legacy `""` still
// deserializes as `None` so older rows keep validating without a migration rewrite.
fn deserialize_api_key<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    Ok(value.and_then(|key| if key.is_empty() { None } else { Some(key) }))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "provider", rename_all = "camelCase")]
pub enum AISecrets {
    #[serde(rename = "openrouter")]
    OpenRouter {
        #[serde(rename = "apiKey", alias = "api_key", deserialize_with = "deserialize_api_key")]
        api_key: Option<String>,
    },
    #[serde(rename = "ollama")]
    Ollama {
        #[serde(rename = "baseUrl", alias = "base_url")]
        base_url: String,
        #[serde(
            rename = "apiKey",
            alias = "api_key",
            default,
            deserialize_with = "deserialize_api_key"
        )]
        api_key: Option<String>,
    },
    #[serde(rename = "lmstudio")]
    LmStudio {
        #[serde(rename = "baseUrl", alias = "base_url")]
        base_url: String,
        #[serde(
            rename = "apiKey",
            alias = "api_key",
            default,
            deserialize_with = "deserialize_api_key"
        )]
        api_key: Option<String>,
    },
    #[serde(rename = "opencodeGo")]
    OpencodeGo {
        #[serde(rename = "apiKey", alias = "api_key", deserialize_with = "deserialize_api_key")]
        api_key: Option<String>,
    },
    #[serde(rename = "opencodeZen")]
    OpencodeZen {
        #[serde(rename = "apiKey", alias = "api_key", deserialize_with = "deserialize_api_key")]
        api_key: Option<String>,
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
            AISecrets::OpenRouter { api_key }
            | AISecrets::OpencodeGo { api_key }
            | AISecrets::OpencodeZen { api_key }
            | AISecrets::Ollama { api_key, .. }
            | AISecrets::LmStudio { api_key, .. } => api_key.as_deref(),
        }
    }

    fn require_api_key_for_input(api_key: &Option<String>, provider: &str) -> Result<(), AppError> {
        match api_key.as_deref().map(str::trim) {
            Some(key) if !key.is_empty() => Ok(()),
            _ => Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_API_KEY,
                Some(format!("{provider}.apiKey is required")),
            )),
        }
    }

    fn reject_stored_api_key(api_key: &Option<String>, provider: &str) -> Result<(), AppError> {
        if api_key.is_some() {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_API_KEY,
                Some(format!("{provider}.apiKey must not be stored in settings")),
            ));
        }
        Ok(())
    }

    // WHY: `validate` on secrets is input-strict (full values). Do not retarget to storage rules.
    pub fn validate(&self) -> Result<(), AppError> {
        self.validate_for_input()
    }

    pub fn validate_for_input(&self) -> Result<(), AppError> {
        match self {
            AISecrets::OpenRouter { api_key } => Self::require_api_key_for_input(api_key, "openrouter"),
            AISecrets::Ollama { base_url, .. } => {
                if base_url.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_BASE_URL,
                        Some("ollama.baseUrl is required".to_string()),
                    ));
                }
                Ok(())
            }
            AISecrets::LmStudio { base_url, .. } => {
                if base_url.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_BASE_URL,
                        Some("lmstudio.baseUrl is required".to_string()),
                    ));
                }
                Ok(())
            }
            AISecrets::OpencodeGo { api_key } => Self::require_api_key_for_input(api_key, "opencodeGo"),
            AISecrets::OpencodeZen { api_key } => Self::require_api_key_for_input(api_key, "opencodeZen"),
        }
    }

    // INVARIANT: The settings JSON must hold only the redacted form. Real API
    // keys are persisted through the OS keyring, so a non-null `api_key` here
    // means plaintext is about to leak into the `settings` table — reject it.
    pub fn validate_for_storage(&self) -> Result<(), AppError> {
        match self {
            AISecrets::OpenRouter { api_key } => Self::reject_stored_api_key(api_key, "openrouter"),
            AISecrets::Ollama { base_url, api_key } => {
                if !base_url.is_empty() && base_url.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_BASE_URL,
                        Some("ollama.baseUrl cannot be whitespace only".to_string()),
                    ));
                }
                Self::reject_stored_api_key(api_key, "ollama")
            }
            AISecrets::LmStudio { base_url, api_key } => {
                if !base_url.is_empty() && base_url.trim().is_empty() {
                    return Err(AppError::new(
                        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_BASE_URL,
                        Some("lmstudio.baseUrl cannot be whitespace only".to_string()),
                    ));
                }
                Self::reject_stored_api_key(api_key, "lmstudio")
            }
            AISecrets::OpencodeGo { api_key } => Self::reject_stored_api_key(api_key, "opencodeGo"),
            AISecrets::OpencodeZen { api_key } => Self::reject_stored_api_key(api_key, "opencodeZen"),
        }
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
