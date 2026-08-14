use koloda_core::domain::ai::{AIProfile, AISecrets};

/// `2026-01-01T00:00:00Z` as epoch millis.
const TEST_CREATED_AT: i64 = 1_767_225_600_000;

#[test]
fn test_ai_secrets_validate_for_storage_rejects_optional_api_key() {
    let secrets = AISecrets::Ollama {
        base_url: "http://localhost:11434".to_string(),
        api_key: Some("local-key".to_string()),
    };

    let result = secrets.validate_for_storage();
    assert_eq!(result.unwrap_err().code, "validation.settings-ai.providers.apiKey");
}

#[test]
fn test_ai_secrets_validate_for_storage_accepts_redacted_openrouter() {
    let secrets = AISecrets::OpenRouter { api_key: None };

    secrets.validate_for_storage().unwrap();
}

#[test]
fn test_ollama_validate_empty_base_url_fails() {
    let secrets = AISecrets::Ollama {
        base_url: "".to_string(),
        api_key: None,
    };

    let result = secrets.validate();
    assert_eq!(result.unwrap_err().code, "validation.settings-ai.providers.baseUrl");
}

#[test]
fn test_lmstudio_validate_ok_with_optional_api_key() {
    let secrets = AISecrets::LmStudio {
        base_url: "http://localhost:1234".to_string(),
        api_key: None,
    };

    secrets.validate().unwrap();
}

#[test]
fn test_lmstudio_validate_empty_base_url_fails() {
    let secrets = AISecrets::LmStudio {
        base_url: "  ".to_string(),
        api_key: Some("key".to_string()),
    };

    let result = secrets.validate();
    assert_eq!(result.unwrap_err().code, "validation.settings-ai.providers.baseUrl");
}

#[test]
fn test_ai_secrets_openrouter_deserialize_api_key_alias() {
    let json = r#"{
        "provider": "openrouter",
        "api_key": "alias-key"
    }"#;

    let secrets: AISecrets = serde_json::from_str(json).expect("Should deserialize with api_key alias");
    assert_eq!(secrets.provider(), "openrouter");
    assert_eq!(secrets.api_key(), Some("alias-key"));
}

#[test]
fn test_ai_secrets_ollama_deserialize_base_url_alias() {
    let json = r#"{
        "provider": "ollama",
        "base_url": "http://localhost:11434"
    }"#;

    let secrets: AISecrets = serde_json::from_str(json).expect("Should deserialize with base_url alias");
    assert_eq!(secrets.provider(), "ollama");
    assert_eq!(secrets.api_key(), None);
}

#[test]
fn test_opencode_go_validate_ok_with_api_key() {
    let secrets = AISecrets::OpencodeGo {
        api_key: Some("go-secret".to_string()),
    };

    secrets.validate().unwrap();
    assert_eq!(secrets.provider(), "opencodeGo");
    assert_eq!(secrets.api_key(), Some("go-secret"));
}

#[test]
fn test_opencode_go_validate_empty_api_key_fails() {
    let secrets = AISecrets::OpencodeGo { api_key: None };

    let result = secrets.validate();
    assert_eq!(result.unwrap_err().code, "validation.settings-ai.providers.apiKey");
}

#[test]
fn test_opencode_go_validate_whitespace_api_key_fails() {
    let secrets = AISecrets::OpencodeGo {
        api_key: Some("  ".to_string()),
    };

    let result = secrets.validate();
    assert_eq!(result.unwrap_err().code, "validation.settings-ai.providers.apiKey");
}

#[test]
fn test_ai_secrets_opencode_go_deserialize_api_key_alias() {
    let json = r#"{
        "provider": "opencodeGo",
        "api_key": "alias-key"
    }"#;

    let secrets: AISecrets = serde_json::from_str(json).expect("Should deserialize with api_key alias");
    assert_eq!(secrets.provider(), "opencodeGo");
    assert_eq!(secrets.api_key(), Some("alias-key"));
}

#[test]
fn test_opencode_zen_validate_ok_with_api_key() {
    let secrets = AISecrets::OpencodeZen {
        api_key: Some("zen-secret".to_string()),
    };

    secrets.validate().unwrap();
    assert_eq!(secrets.provider(), "opencodeZen");
    assert_eq!(secrets.api_key(), Some("zen-secret"));
}

#[test]
fn test_opencode_zen_validate_empty_api_key_fails() {
    let secrets = AISecrets::OpencodeZen { api_key: None };

    let result = secrets.validate();
    assert_eq!(result.unwrap_err().code, "validation.settings-ai.providers.apiKey");
}

#[test]
fn test_opencode_zen_validate_whitespace_api_key_fails() {
    let secrets = AISecrets::OpencodeZen {
        api_key: Some("  ".to_string()),
    };

    let result = secrets.validate();
    assert_eq!(result.unwrap_err().code, "validation.settings-ai.providers.apiKey");
}

#[test]
fn test_ai_secrets_opencode_zen_deserialize_api_key_alias() {
    let json = r#"{
        "provider": "opencodeZen",
        "api_key": "alias-key"
    }"#;

    let secrets: AISecrets = serde_json::from_str(json).expect("Should deserialize with api_key alias");
    assert_eq!(secrets.provider(), "opencodeZen");
    assert_eq!(secrets.api_key(), Some("alias-key"));
}

#[test]
fn test_ollama_cloud_validate_ok_with_api_key() {
    let secrets = AISecrets::OllamaCloud {
        api_key: Some("cloud-secret".to_string()),
    };

    secrets.validate().unwrap();
    assert_eq!(secrets.provider(), "ollamaCloud");
    assert_eq!(secrets.api_key(), Some("cloud-secret"));
}

#[test]
fn test_ollama_cloud_validate_empty_api_key_fails() {
    let secrets = AISecrets::OllamaCloud { api_key: None };

    let result = secrets.validate();
    assert_eq!(result.unwrap_err().code, "validation.settings-ai.providers.apiKey");
}

#[test]
fn test_ollama_cloud_validate_whitespace_api_key_fails() {
    let secrets = AISecrets::OllamaCloud {
        api_key: Some("  ".to_string()),
    };

    let result = secrets.validate();
    assert_eq!(result.unwrap_err().code, "validation.settings-ai.providers.apiKey");
}

#[test]
fn test_ai_secrets_ollama_cloud_deserialize_api_key_alias() {
    let json = r#"{
        "provider": "ollamaCloud",
        "api_key": "alias-key"
    }"#;

    let secrets: AISecrets = serde_json::from_str(json).expect("Should deserialize with api_key alias");
    assert_eq!(secrets.provider(), "ollamaCloud");
    assert_eq!(secrets.api_key(), Some("alias-key"));
}

#[test]
fn test_ai_secrets_invalid_provider_fails() {
    let json = r#"{
        "provider": "unknown",
        "apiKey": "value"
    }"#;

    let result: Result<AISecrets, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail for unsupported provider");
}

#[test]
fn test_ai_profile_validate_for_input_ok_with_secrets() {
    let profile = AIProfile {
        id: "profile-1".to_string(),
        title: Some("Main profile".to_string()),
        secrets: Some(AISecrets::OpenRouter {
            api_key: Some("key-123".to_string()),
        }),
        has_secrets: true,
        whitelist_model_ids: None,
        created_at: TEST_CREATED_AT,
    };

    profile.validate_for_input().unwrap();
}

#[test]
fn test_ai_profile_validate_for_storage_rejects_plaintext_api_key() {
    let profile = AIProfile {
        id: "profile-1".to_string(),
        title: Some("Main profile".to_string()),
        secrets: Some(AISecrets::OpenRouter {
            api_key: Some("key-123".to_string()),
        }),
        has_secrets: true,
        whitelist_model_ids: None,
        created_at: TEST_CREATED_AT,
    };

    let result = profile.validate_for_storage();
    assert_eq!(result.unwrap_err().code, "validation.settings-ai.providers.apiKey");
}

#[test]
fn test_ai_profile_validate_ok_without_secrets() {
    let profile = AIProfile {
        id: "profile-2".to_string(),
        title: None,
        secrets: None,
        has_secrets: false,
        whitelist_model_ids: None,
        created_at: TEST_CREATED_AT,
    };

    profile.validate().unwrap();
}

#[test]
fn test_ai_profile_validate_empty_id_fails() {
    let profile = AIProfile {
        id: "".to_string(),
        title: Some("Profile".to_string()),
        secrets: None,
        has_secrets: false,
        whitelist_model_ids: None,
        created_at: TEST_CREATED_AT,
    };

    let result = profile.validate();
    assert_eq!(result.unwrap_err().code, "validation.settings-ai.providers.id");
}

#[test]
fn test_ai_profile_validate_title_too_long_fails() {
    let profile = AIProfile {
        id: "profile-3".to_string(),
        title: Some("a".repeat(129)),
        secrets: None,
        has_secrets: false,
        whitelist_model_ids: None,
        created_at: TEST_CREATED_AT,
    };

    let result = profile.validate();
    assert_eq!(result.unwrap_err().code, "validation.common.title.too-long");
}

#[test]
fn test_ai_profile_validate_invalid_nested_secrets_fails() {
    let profile = AIProfile {
        id: "profile-4".to_string(),
        title: Some("Profile".to_string()),
        secrets: Some(AISecrets::OpenRouter { api_key: None }),
        has_secrets: false,
        whitelist_model_ids: None,
        created_at: TEST_CREATED_AT,
    };

    let result = profile.validate_for_input();
    assert_eq!(result.unwrap_err().code, "validation.settings-ai.providers.apiKey");
}

#[test]
fn test_ai_secrets_deserialize_empty_api_key_as_none() {
    let json = r#"{
        "provider": "openrouter",
        "apiKey": ""
    }"#;

    let secrets: AISecrets = serde_json::from_str(json).expect("legacy empty apiKey should deserialize");
    assert_eq!(secrets.api_key(), None);

    let serialized = serde_json::to_value(&secrets).expect("redacted secrets should serialize");
    assert_eq!(serialized.get("apiKey"), Some(&serde_json::Value::Null));
}

#[test]
fn test_ai_profile_serialization_renders_iso_string_for_created_at() {
    let profile = AIProfile {
        id: "profile-1".to_string(),
        title: None,
        secrets: None,
        has_secrets: false,
        whitelist_model_ids: None,
        created_at: TEST_CREATED_AT,
    };

    let serialized = serde_json::to_value(&profile).expect("profile should serialize");
    let created_at = serialized
        .get("createdAt")
        .and_then(|v| v.as_str())
        .expect("createdAt should be a string");

    assert!(
        chrono::DateTime::parse_from_rfc3339(created_at).is_ok(),
        "createdAt is not a valid RFC3339 string: {created_at}"
    );
}

#[test]
fn test_ai_profile_deserialization_accepts_iso_string_for_created_at() {
    let data = serde_json::json!({
        "id": "profile-1",
        "createdAt": "2026-01-01T00:00:00Z"
    });

    let profile: AIProfile = serde_json::from_value(data).expect("ISO string for createdAt should deserialize");
    assert_eq!(profile.created_at, TEST_CREATED_AT);
    assert_eq!(profile.whitelist_model_ids, None);
}

#[test]
fn test_ai_profile_serialization_omits_unset_whitelist() {
    let profile = AIProfile {
        id: "profile-1".to_string(),
        title: None,
        secrets: None,
        has_secrets: false,
        whitelist_model_ids: None,
        created_at: TEST_CREATED_AT,
    };

    let serialized = serde_json::to_value(&profile).expect("profile should serialize");
    assert!(
        serialized.get("whitelistModelIds").is_none(),
        "unset whitelist must be omitted so older rows stay unchanged"
    );
}

#[test]
fn test_ai_profile_serialization_keeps_empty_whitelist() {
    let profile = AIProfile {
        id: "profile-1".to_string(),
        title: None,
        secrets: None,
        has_secrets: false,
        whitelist_model_ids: Some(vec![]),
        created_at: TEST_CREATED_AT,
    };

    let serialized = serde_json::to_value(&profile).expect("profile should serialize");
    assert_eq!(
        serialized.get("whitelistModelIds"),
        Some(&serde_json::json!([])),
        "empty allowlist is distinct from unset"
    );
}

#[test]
fn test_ai_profile_validate_ok_with_whitelist() {
    let profile = AIProfile {
        id: "profile-1".to_string(),
        title: None,
        secrets: None,
        has_secrets: false,
        whitelist_model_ids: Some(vec!["openai/gpt-4".to_string()]),
        created_at: TEST_CREATED_AT,
    };

    profile.validate().unwrap();
}

#[test]
fn test_ai_profile_validate_empty_whitelist_model_id_fails() {
    let profile = AIProfile {
        id: "profile-1".to_string(),
        title: None,
        secrets: None,
        has_secrets: false,
        whitelist_model_ids: Some(vec!["".to_string()]),
        created_at: TEST_CREATED_AT,
    };

    let result = profile.validate();
    assert_eq!(
        result.unwrap_err().code,
        "validation.settings-ai.profiles.whitelist-model-ids"
    );
}

#[test]
fn test_update_profile_data_whitelist_patch_states() {
    use koloda_core::domain::ai::UpdateProfileData;

    let omitted: UpdateProfileData =
        serde_json::from_value(serde_json::json!({ "id": "profile-1" })).expect("omitted whitelist should deserialize");
    assert_eq!(omitted.whitelist_model_ids, None);

    let cleared: UpdateProfileData = serde_json::from_value(serde_json::json!({
        "id": "profile-1",
        "whitelistModelIds": null
    }))
    .expect("null whitelist should deserialize");
    assert_eq!(cleared.whitelist_model_ids, Some(None));

    let set: UpdateProfileData = serde_json::from_value(serde_json::json!({
        "id": "profile-1",
        "whitelistModelIds": ["openai/gpt-4"]
    }))
    .expect("array whitelist should deserialize");
    assert_eq!(set.whitelist_model_ids, Some(Some(vec!["openai/gpt-4".to_string()])));
}
