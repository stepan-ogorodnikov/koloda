use chrono::Utc;
use serde_json::Value;
use std::sync::LazyLock;

use crate::app::db::Database;
use crate::app::error::AppError;
use crate::app::secrets::create_secret_store;
use crate::app::utility::generate_uuid;
use crate::domain::settings::SettingsName;
use crate::domain::settings_ai::{AIProfile, AISecrets, AISettings};

const STORE_ID: &str = "koloda";

static SECRET_STORE: LazyLock<Box<dyn crate::app::secrets::SecretStore + 'static>> =
    LazyLock::new(|| create_secret_store(STORE_ID));

fn get_ai_profile_store_key(profile_id: &str) -> String {
    format!("ai-profile-{}", profile_id)
}

fn set_api_key(profile_id: &str, api_key: &str) -> Result<(), AppError> {
    SECRET_STORE.set(&get_ai_profile_store_key(profile_id), api_key)
}

fn get_api_key(profile_id: &str) -> Result<Option<String>, AppError> {
    SECRET_STORE.get(&get_ai_profile_store_key(profile_id))
}

fn remove_api_key(profile_id: &str) -> Result<(), AppError> {
    SECRET_STORE.remove(&get_ai_profile_store_key(profile_id))
}

fn redact_secrets(secrets: &AISecrets) -> AISecrets {
    match secrets {
        AISecrets::OpenRouter { .. } => AISecrets::OpenRouter { api_key: String::new() },
        AISecrets::Ollama { base_url } => AISecrets::Ollama {
            base_url: base_url.clone(),
        },
        AISecrets::LmStudio { base_url, .. } => AISecrets::LmStudio {
            base_url: base_url.clone(),
            api_key: None,
        },
    }
}

fn reconstruct_secrets(secrets: &AISecrets, api_key: String) -> AISecrets {
    match secrets {
        AISecrets::OpenRouter { .. } => AISecrets::OpenRouter { api_key },
        AISecrets::Ollama { base_url } => AISecrets::Ollama {
            base_url: base_url.clone(),
        },
        AISecrets::LmStudio { base_url, .. } => AISecrets::LmStudio {
            base_url: base_url.clone(),
            api_key: Some(api_key),
        },
    }
}

fn get_ai_settings_or_default(db: &Database) -> Result<AISettings, AppError> {
    let settings = crate::repo::settings::get_settings(db, SettingsName::Ai)?;
    let content = settings.map(|s| s.content).unwrap_or_else(|| {
        serde_json::to_value(AISettings::default()).expect("Failed to serialize default AISettings")
    });
    let parsed: AISettings = serde_json::from_value(content)?;

    Ok(parsed)
}

fn set_ai_settings(db: &Database, settings: AISettings) -> Result<(), AppError> {
    let content: Value = serde_json::to_value(&settings)?;
    crate::repo::settings::set_settings(db, SettingsName::Ai, content)?;

    Ok(())
}

pub fn get_ai_profiles(db: &Database) -> Result<Vec<AIProfile>, AppError> {
    let settings = get_ai_settings_or_default(db)?;

    let profiles_with_secrets: Vec<AIProfile> = settings
        .profiles
        .into_iter()
        .map(|profile| {
            let api_key = get_api_key(&profile.id).ok().flatten();
            let secrets_with_key = match (&profile.secrets, api_key) {
                (Some(s), Some(key)) => Some(reconstruct_secrets(s, key)),
                (Some(s), None) => Some(s.clone()),
                _ => None,
            };
            AIProfile {
                secrets: secrets_with_key,
                ..profile
            }
        })
        .collect();

    Ok(profiles_with_secrets)
}

pub fn add_ai_profile(db: &Database, title: Option<String>, secrets: Option<AISecrets>) -> Result<AIProfile, AppError> {
    let mut settings = get_ai_settings_or_default(db)?;
    let now = Utc::now().to_rfc3339();
    let profile_id = generate_uuid();

    if let Some(ref secrets) = secrets {
        secrets.validate()?;
        if let Some(api_key) = secrets.api_key() {
            set_api_key(&profile_id, api_key)?;
        }
    }

    let secrets_for_db = secrets.as_ref().map(redact_secrets);
    let profile = AIProfile {
        id: profile_id.clone(),
        title,
        secrets: secrets_for_db,
        last_used_model: None,
        created_at: now,
        last_used_at: None,
    };

    settings.profiles.push(profile.clone());
    set_ai_settings(db, settings)?;

    let api_key = get_api_key(&profile_id)?;

    let secrets_with_key = match (&secrets, api_key) {
        (Some(s), Some(key)) => Some(reconstruct_secrets(s, key)),
        (Some(s), None) => Some(s.clone()),
        _ => None,
    };

    Ok(AIProfile {
        secrets: secrets_with_key,
        ..profile
    })
}

pub fn remove_ai_profile(db: &Database, id: &str) -> Result<(), AppError> {
    let _ = remove_api_key(id);

    let mut settings = get_ai_settings_or_default(db)?;
    settings.profiles.retain(|profile| profile.id != id);
    set_ai_settings(db, settings)
}

pub fn touch_ai_profile(db: &Database, id: &str, model_id: Option<String>) -> Result<(), AppError> {
    let mut settings = get_ai_settings_or_default(db)?;
    let now = Utc::now().to_rfc3339();

    for profile in &mut settings.profiles {
        if profile.id == id {
            profile.last_used_at = Some(now);
            if let Some(model_id) = model_id {
                profile.last_used_model = Some(model_id);
            }

            break;
        }
    }

    set_ai_settings(db, settings)
}
