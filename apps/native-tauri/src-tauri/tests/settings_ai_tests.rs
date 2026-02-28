use koloda_native_tauri::domain::settings::SettingsName;
use koloda_native_tauri::domain::settings_ai::AISettings;

// ============================================================================
// VALID SETTINGS
// ============================================================================

#[test]
fn test_valid_ai_settings_empty_profiles() {
    let json = r#"{
        "profiles": []
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize valid JSON");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_valid_ai_settings_with_openrouter_profile() {
    let json = r#"{
        "profiles": [
            {
                "id": "profile-1",
                "title": "OpenRouter",
                "secrets": {
                    "provider": "openrouter",
                    "apiKey": "secret-key"
                },
                "lastUsedModel": "openai/gpt-4o-mini",
                "createdAt": "2026-01-01T00:00:00Z",
                "lastUsedAt": null
            }
        ]
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_valid_ai_settings_with_lmstudio_profile_without_api_key() {
    let json = r#"{
        "profiles": [
            {
                "id": "profile-2",
                "title": null,
                "secrets": {
                    "provider": "lmstudio",
                    "baseUrl": "http://localhost:1234",
                    "apiKey": null
                },
                "lastUsedModel": null,
                "createdAt": "2026-01-01T00:00:00Z",
                "lastUsedAt": null
            }
        ]
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

// ============================================================================
// MISSING FIELDS
// ============================================================================

#[test]
fn test_missing_profiles_fails() {
    let json = r#"{}"#;

    let result: Result<AISettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when profiles is missing");
}

// ============================================================================
// EXTRA FIELDS
// ============================================================================

#[test]
fn test_ai_settings_extra_fields_ignored() {
    let json = r#"{
        "profiles": [],
        "nonexistent": "ignored"
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

// ============================================================================
// INVALID CONTENT
// ============================================================================

#[test]
fn test_profiles_as_object_fails() {
    let json = r#"{
        "profiles": {}
    }"#;

    let result: Result<AISettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when profiles is not an array");
}

// ============================================================================
// SETTINGS_NAME DISPATCHER
// ============================================================================

#[test]
fn test_settings_name_ai_validation_with_non_object_content() {
    let content = serde_json::json!("not an object");

    let result = SettingsName::Ai.validate(&content);
    assert!(result.is_err());
}

#[test]
fn test_settings_name_ai_validation_with_array_content() {
    let content = serde_json::json!([1, 2, 3]);

    let result = SettingsName::Ai.validate(&content);
    assert!(result.is_err());
}

#[test]
fn test_settings_name_ai_validation_valid() {
    let content = serde_json::json!({
        "profiles": [
            {
                "id": "profile-5",
                "title": "Local",
                "secrets": {
                    "provider": "ollama",
                    "baseUrl": "http://localhost:11434"
                },
                "lastUsedModel": null,
                "createdAt": "2026-01-01T00:00:00Z",
                "lastUsedAt": null
            }
        ]
    });

    let result = SettingsName::Ai.validate(&content);
    assert!(result.is_ok());
}
