use serde_json::Value;

use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::app::secrets::get_secret_store;
use crate::app::utility::{generate_uuid, get_current_timestamp};
use crate::domain::settings::SettingsName;
use crate::domain::settings_ai::{AIProfile, AISecrets, AISettings};

fn get_ai_profile_store_key(profile_id: &str) -> String {
    format!("ai-profile-{}", profile_id)
}

fn set_api_key(profile_id: &str, api_key: &str) -> Result<(), AppError> {
    get_secret_store()?.set(&get_ai_profile_store_key(profile_id), api_key)
}

fn get_api_key(profile_id: &str) -> Result<Option<String>, AppError> {
    get_secret_store()?.get(&get_ai_profile_store_key(profile_id))
}

fn remove_api_key(profile_id: &str) -> Result<(), AppError> {
    get_secret_store()?.remove(&get_ai_profile_store_key(profile_id))
}

fn redact_secrets(secrets: &AISecrets) -> AISecrets {
    match secrets {
        AISecrets::OpenRouter { .. } => AISecrets::OpenRouter { api_key: String::new() },
        AISecrets::Ollama { base_url, .. } => AISecrets::Ollama {
            base_url: base_url.clone(),
            api_key: None,
        },
        AISecrets::LmStudio { base_url, .. } => AISecrets::LmStudio {
            base_url: base_url.clone(),
            api_key: None,
        },
        AISecrets::OpencodeGo { .. } => AISecrets::OpencodeGo { api_key: String::new() },
        AISecrets::OpencodeZen { .. } => AISecrets::OpencodeZen { api_key: String::new() },
    }
}

fn reconstruct_secrets(secrets: &AISecrets, api_key: String) -> AISecrets {
    match secrets {
        AISecrets::OpenRouter { .. } => AISecrets::OpenRouter { api_key },
        AISecrets::Ollama { base_url, .. } => AISecrets::Ollama {
            base_url: base_url.clone(),
            api_key: Some(api_key),
        },
        AISecrets::LmStudio { base_url, .. } => AISecrets::LmStudio {
            base_url: base_url.clone(),
            api_key: Some(api_key),
        },
        AISecrets::OpencodeGo { .. } => AISecrets::OpencodeGo { api_key },
        AISecrets::OpencodeZen { .. } => AISecrets::OpencodeZen { api_key },
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

fn drop_ai_profile_from_settings(db: &Database, profile_id: &str) -> Result<(), AppError> {
    let mut settings = get_ai_settings_or_default(db)?;
    settings.profiles.retain(|profile| profile.id != profile_id);
    set_ai_settings(db, settings)
}

fn restore_ai_profile_in_settings(db: &Database, previous: AIProfile) -> Result<(), AppError> {
    let mut settings = get_ai_settings_or_default(db)?;
    if let Some(slot) = settings.profiles.iter_mut().find(|p| p.id == previous.id) {
        *slot = previous;
    } else {
        settings.profiles.push(previous);
    }
    set_ai_settings(db, settings)
}

fn attach_api_key(profile: AIProfile, api_key: Option<String>) -> AIProfile {
    let secrets_with_key = match (&profile.secrets, api_key) {
        (Some(s), Some(key)) => Some(reconstruct_secrets(s, key)),
        (Some(s), None) => Some(s.clone()),
        _ => None,
    };
    AIProfile {
        secrets: secrets_with_key,
        ..profile
    }
}

pub fn get_ai_profiles(db: &Database) -> Result<Vec<AIProfile>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        let settings = get_ai_settings_or_default(db)?;

        // WHY: Propagate keyring errors instead of swallowing them as `None`. A
        // real keyring failure (lock poisoned / I/O error) used to be
        // indistinguishable from `Ok(None)` (no key stored) under `.ok().flatten()`,
        // so a broken keyring silently masqueraded as "no api keys configured".
        let profiles_with_secrets: Vec<AIProfile> = settings
            .profiles
            .into_iter()
            .map(|profile| -> Result<AIProfile, AppError> {
                let api_key = get_api_key(&profile.id)?;
                Ok(attach_api_key(profile, api_key))
            })
            .collect::<Result<Vec<_>, _>>()?;

        Ok(profiles_with_secrets)
    })
}

pub fn add_ai_profile(db: &Database, title: Option<String>, secrets: Option<AISecrets>) -> Result<AIProfile, AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        let mut settings = get_ai_settings_or_default(db)?;
        let now = get_current_timestamp()?;
        let profile_id = generate_uuid();

        if let Some(ref secrets) = secrets {
            secrets.validate_for_input()?;
        }

        let secrets_for_db = secrets.as_ref().map(redact_secrets);
        let profile = AIProfile {
            id: profile_id.clone(),
            title,
            secrets: secrets_for_db,
            created_at: now,
        };

        // WHY: Persist settings before the keyring write. Keyring-first left orphaned
        // secrets under ids that never landed in settings (remove_ai_profile cannot
        // find them). On keyring failure after DB success, roll the profile back.
        settings.profiles.push(profile.clone());
        set_ai_settings(db, settings)?;

        if let Some(ref secrets) = secrets {
            if let Some(api_key) = secrets.api_key() {
                if let Err(err) = set_api_key(&profile_id, api_key) {
                    // WHY: Best-effort rollback; prefer the original keyring error over a
                    // secondary settings failure. `?` here would replace the cause.
                    let _ = drop_ai_profile_from_settings(db, &profile_id);
                    return Err(err);
                }
            }
        }

        let api_key = get_api_key(&profile_id)?;
        Ok(attach_api_key(profile, api_key))
    })
}

pub fn update_ai_profile(
    db: &Database,
    id: &str,
    title: Option<String>,
    secrets: Option<AISecrets>,
) -> Result<AIProfile, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        let mut settings = get_ai_settings_or_default(db)?;

        let profile_idx = settings.profiles.iter().position(|p| p.id == id);
        let profile_idx = profile_idx
            .ok_or_else(|| AppError::new(error_codes::NOT_FOUND_AI_PROFILE, Some("Profile not found".to_string())))?;

        if let Some(ref secrets) = secrets {
            secrets.validate_for_input()?;
        }

        let previous_profile = settings.profiles[profile_idx].clone();
        let existing_profile = &mut settings.profiles[profile_idx];

        if let Some(ref new_secrets) = secrets {
            existing_profile.secrets = Some(redact_secrets(new_secrets));
        }

        if title.is_some() {
            existing_profile.title = title;
        }

        let updated_profile = existing_profile.clone();
        set_ai_settings(db, settings)?;

        // WHY: Same DB-then-keyring ordering as add. Clear stale keys after the DB
        // write so a failed remove can restore settings and avoid re-attaching an
        // orphaned keyring entry on the next get. On any keyring failure, roll back.
        if let Some(ref new_secrets) = secrets {
            let keyring_result = match new_secrets.api_key() {
                Some(api_key) => set_api_key(id, api_key),
                // WHY: otherwise get_ai_profiles reconstructs the redacted profile
                // from the orphaned keyring entry, re-attaching the old secret.
                None => remove_api_key(id),
            };
            if let Err(err) = keyring_result {
                // WHY: Best-effort rollback; prefer the original keyring error over a
                // secondary settings failure. `?` here would replace the cause.
                let _ = restore_ai_profile_in_settings(db, previous_profile);
                return Err(err);
            }
        }

        let api_key = get_api_key(id)?;
        Ok(attach_api_key(updated_profile, api_key))
    })
}

pub fn remove_ai_profile(db: &Database, id: &str) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_DELETE, || {
        remove_api_key(id)?;

        let mut settings = get_ai_settings_or_default(db)?;
        settings.profiles.retain(|profile| profile.id != id);
        set_ai_settings(db, settings)
    })
}
