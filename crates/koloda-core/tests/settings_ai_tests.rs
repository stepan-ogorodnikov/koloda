use koloda_core::domain::settings::SettingsName;
use koloda_core::domain::settings_ai::AISettings;

// ============================================================================
// VALID SETTINGS
// ============================================================================

#[test]
fn test_valid_ai_settings_empty_profiles() {
    let json = r#"{
        "profiles": []
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize valid JSON");
    settings.validate().unwrap();
}

#[test]
fn test_valid_ai_settings_with_openrouter_profile_redacted() {
    let json = r#"{
        "profiles": [
            {
                "id": "profile-1",
                "title": "OpenRouter",
                "secrets": {
                    "provider": "openrouter",
                    "apiKey": ""
                },
                "createdAt": "2026-01-01T00:00:00Z"
            }
        ]
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    settings.validate().unwrap();
}

#[test]
fn test_ai_settings_with_plaintext_api_key_fails_storage_validation() {
    let json = r#"{
        "profiles": [
            {
                "id": "profile-1",
                "title": "OpenRouter",
                "secrets": {
                    "provider": "openrouter",
                    "apiKey": "sk-live-secret-key"
                },
                "createdAt": "2026-01-01T00:00:00Z"
            }
        ]
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert_eq!(
        result
            .expect_err("Plaintext apiKey must not pass storage validation")
            .code,
        "validation.settings-ai.providers.apiKey"
    );
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
                "createdAt": "2026-01-01T00:00:00Z"
            }
        ]
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    settings.validate().unwrap();
}

#[test]
fn test_valid_ai_settings_with_opencode_go_profile_redacted() {
    let json = r#"{
        "profiles": [
            {
                "id": "profile-4",
                "title": "OpenCode Go",
                "secrets": {
                    "provider": "opencodeGo",
                    "apiKey": ""
                },
                "createdAt": "2026-01-01T00:00:00Z"
            }
        ]
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    settings.validate().unwrap();
}

#[test]
fn test_valid_ai_settings_with_opencode_zen_profile_redacted() {
    let json = r#"{
        "profiles": [
            {
                "id": "profile-5",
                "title": "OpenCode Zen",
                "secrets": {
                    "provider": "opencodeZen",
                    "apiKey": ""
                },
                "createdAt": "2026-01-01T00:00:00Z"
            }
        ]
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    settings.validate().unwrap();
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
    settings.validate().unwrap();
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
                "createdAt": "2026-01-01T00:00:00Z"
            }
        ]
    });

    let result = SettingsName::Ai.validate(&content);
    result.unwrap();
}

// ============================================================================
// DUPLICATE PROFILE IDS
// ============================================================================

#[test]
fn test_duplicate_profile_ids_fail() {
    let json = r#"{
        "profiles": [
            {
                "id": "dup-id",
                "title": "First",
                "secrets": { "provider": "ollama", "baseUrl": "http://localhost:11434" },
                "createdAt": "2026-01-01T00:00:00Z"
            },
            {
                "id": "dup-id",
                "title": "Second",
                "secrets": { "provider": "ollama", "baseUrl": "http://localhost:11435" },
                "createdAt": "2026-01-01T00:00:00Z"
            }
        ]
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    let err = result.expect_err("Duplicate profile ids should fail validation");
    assert_eq!(
        err.code, "validation.ai-providers.profile-id.duplicate",
        "Wrong error code for duplicate profile id: {}",
        err.code
    );
}

#[test]
fn test_duplicate_profile_ids_fail_for_input_too() {
    let json = r#"{
        "profiles": [
            { "id": "x", "title": null, "createdAt": "2026-01-01T00:00:00Z" },
            { "id": "x", "title": null, "createdAt": "2026-01-01T00:00:00Z" }
        ]
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate_for_input();
    assert!(result.is_err(), "Duplicate profile ids should fail validate_for_input");
}

// ============================================================================
// ASSISTANT TEMPERATURE
// ============================================================================

#[test]
fn test_assistant_temperature_defaults_when_omitted() {
    // Mirrors the TS schema's `.default(0.2)`: omitting `temperature` fills in
    // 0.2 (and validates) rather than failing deserialization.
    let json = r#"{
        "profiles": [],
        "assistant": {
            "cardsPromptTemplate": null,
            "chatPromptTemplate": null
        }
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    let temp = settings
        .assistant
        .as_ref()
        .expect("assistant should be present")
        .temperature;
    assert!(
        (temp - 0.2).abs() < f64::EPSILON,
        "omitted temperature should default to 0.2, got {}",
        temp
    );
    assert!(settings.validate().is_ok(), "defaulted temperature should validate");
}

#[test]
fn test_assistant_temperature_default_is_canonicalized_on_normalize() {
    // The settings normalize path re-serializes the parsed value, so an omitted
    // temperature should be written back as an explicit 0.2 in the store.
    let content = serde_json::json!({
        "profiles": [],
        "assistant": {
            "cardsPromptTemplate": null,
            "chatPromptTemplate": null
        }
    });

    let normalized = SettingsName::Ai.normalize(content).expect("normalize should succeed");
    let temp = normalized
        .get("assistant")
        .and_then(|a| a.get("temperature"))
        .and_then(|t| t.as_f64())
        .expect("normalized assistant.temperature should be present");
    assert!(
        (temp - 0.2).abs() < f64::EPSILON,
        "normalized temperature should be explicit 0.2, got {}",
        temp
    );
}

#[test]
fn test_assistant_temperature_within_range_ok() {
    let json = r#"{
        "profiles": [],
        "assistant": { "temperature": 1.5 }
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok(), "Temperature within range should validate");
}

#[test]
fn test_assistant_temperature_below_range_fails() {
    let json = r#"{
        "profiles": [],
        "assistant": { "temperature": -0.1 }
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert_eq!(
        result.expect_err("Negative temperature should fail").code,
        "validation.assistant-settings.temperature-range"
    );
}

#[test]
fn test_assistant_temperature_above_range_fails() {
    let json = r#"{
        "profiles": [],
        "assistant": { "temperature": 5.0 }
    }"#;

    let settings: AISettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert_eq!(
        result.expect_err("Out-of-range temperature should fail").code,
        "validation.assistant-settings.temperature-range"
    );
}

#[test]
fn test_assistant_temperature_nan_value_fails_validation() {
    // f64::NaN deserializes from JSON, so the validator must catch it explicitly.
    let mut settings: AISettings = serde_json::from_str(r#"{ "profiles": [] }"#).unwrap();
    settings.assistant = Some(koloda_core::domain::settings_ai::AssistantSettings {
        temperature: f64::NAN,
        cards_prompt_template: None,
        chat_prompt_template: None,
    });

    let result = settings.validate();
    assert_eq!(
        result.expect_err("NaN temperature should fail validation").code,
        "validation.assistant-settings.temperature-range"
    );
}

#[test]
fn test_assistant_temperature_null_fails_deserialization() {
    // Matches the TS side: `{ temperature: null }` is rejected (number expected,
    // the default only applies when the field is omitted, not null).
    let json = r#"{ "profiles": [], "assistant": { "temperature": null } }"#;
    let result: Result<AISettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "null temperature should fail to deserialize");
}
