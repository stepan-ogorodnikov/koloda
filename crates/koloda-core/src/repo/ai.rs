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
        AISecrets::OpenRouter { .. } => AISecrets::OpenRouter { api_key: None },
        AISecrets::Ollama { base_url, .. } => AISecrets::Ollama {
            base_url: base_url.clone(),
            api_key: None,
        },
        AISecrets::LmStudio { base_url, .. } => AISecrets::LmStudio {
            base_url: base_url.clone(),
            api_key: None,
        },
        AISecrets::OpencodeGo { .. } => AISecrets::OpencodeGo { api_key: None },
        AISecrets::OpencodeZen { .. } => AISecrets::OpencodeZen { api_key: None },
    }
}

fn reconstruct_secrets(secrets: &AISecrets, api_key: String) -> AISecrets {
    match secrets {
        AISecrets::OpenRouter { .. } => AISecrets::OpenRouter { api_key: Some(api_key) },
        AISecrets::Ollama { base_url, .. } => AISecrets::Ollama {
            base_url: base_url.clone(),
            api_key: Some(api_key),
        },
        AISecrets::LmStudio { base_url, .. } => AISecrets::LmStudio {
            base_url: base_url.clone(),
            api_key: Some(api_key),
        },
        AISecrets::OpencodeGo { .. } => AISecrets::OpencodeGo { api_key: Some(api_key) },
        AISecrets::OpencodeZen { .. } => AISecrets::OpencodeZen { api_key: Some(api_key) },
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

// WHY: Public reads must never ship usable keys. `has_secrets` comes from keyring
// presence — not from a redacted `api_key: None` — so older settings rows that
// still deserialize `has_secrets: false` stay correct when a key exists.
fn to_public_profile(profile: AIProfile, has_secrets: bool) -> AIProfile {
    AIProfile {
        secrets: profile.secrets.as_ref().map(redact_secrets),
        has_secrets,
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
        let profiles: Vec<AIProfile> = settings
            .profiles
            .into_iter()
            .map(|profile| -> Result<AIProfile, AppError> {
                let has_secrets = get_api_key(&profile.id)?.is_some();
                Ok(to_public_profile(profile, has_secrets))
            })
            .collect::<Result<Vec<_>, _>>()?;

        Ok(profiles)
    })
}

// INVARIANT: Main-process only. Reconstructs usable secrets for host AI handlers.
// Never expose this as a renderer `cmd_*`.
pub fn get_ai_profile_secrets(db: &Database, profile_id: &str) -> Result<Option<AISecrets>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        let settings = get_ai_settings_or_default(db)?;
        let Some(profile) = settings.profiles.into_iter().find(|p| p.id == profile_id) else {
            return Ok(None);
        };
        let Some(secrets) = profile.secrets else {
            return Ok(None);
        };
        let api_key = get_api_key(&profile.id)?;
        Ok(Some(match api_key {
            Some(key) => reconstruct_secrets(&secrets, key),
            None => secrets,
        }))
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
        let has_secrets = secrets.as_ref().and_then(|s| s.api_key()).is_some();
        let profile = AIProfile {
            id: profile_id.clone(),
            title,
            secrets: secrets_for_db,
            has_secrets,
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
                    if let Err(_rollback_err) = drop_ai_profile_from_settings(db, &profile_id) {}
                    return Err(err);
                }
            }
        }

        let has_secrets = get_api_key(&profile_id)?.is_some();
        Ok(to_public_profile(profile, has_secrets))
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

        let previous_profile = settings
            .profiles
            .get(profile_idx)
            .ok_or_else(|| AppError::new(error_codes::NOT_FOUND_AI_PROFILE, Some("Profile not found".to_string())))?
            .clone();
        let existing_profile = settings
            .profiles
            .get_mut(profile_idx)
            .ok_or_else(|| AppError::new(error_codes::NOT_FOUND_AI_PROFILE, Some("Profile not found".to_string())))?;

        if let Some(ref new_secrets) = secrets {
            existing_profile.secrets = Some(redact_secrets(new_secrets));
            // WHY: Stored flag is advisory; public reads re-derive from keyring.
            existing_profile.has_secrets = new_secrets.api_key().is_some();
        }

        if title.is_some() {
            existing_profile.title = title;
        }

        let updated_profile = existing_profile.clone();
        set_ai_settings(db, settings)?;

        // WHY: Same DB-then-keyring ordering as add. On any keyring failure, roll back.
        if let Some(ref new_secrets) = secrets {
            let previous_provider = previous_profile.secrets.as_ref().map(|s| s.provider());
            let provider_changed = previous_provider != Some(new_secrets.provider());
            let keyring_result = match new_secrets.api_key() {
                Some(api_key) => set_api_key(id, api_key),
                // WHY: Edit forms submit redacted/empty apiKey when the user did not
                // replace the key. Keep the keyring entry unless the provider changed
                // (e.g. OpenRouter → Ollama with no key) so an orphaned key cannot
                // flip `has_secrets` on the next public read.
                None if provider_changed => remove_api_key(id),
                None => Ok(()),
            };
            if let Err(err) = keyring_result {
                // WHY: Best-effort rollback; prefer the original keyring error over a
                // secondary settings failure. `?` here would replace the cause.
                if let Err(_rollback_err) = restore_ai_profile_in_settings(db, previous_profile) {}
                return Err(err);
            }
        }

        let has_secrets = get_api_key(id)?.is_some();
        Ok(to_public_profile(updated_profile, has_secrets))
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
