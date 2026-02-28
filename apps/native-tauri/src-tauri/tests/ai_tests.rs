use koloda_native_tauri::domain::ai::{AIProfile, AISecrets};

// ============================================================================
// AI SECRETS - VALIDATION
// ============================================================================

#[test]
fn test_ollama_validate_empty_base_url_fails() {
    let secrets = AISecrets::Ollama {
        base_url: "".to_string(),
    };

    let result = secrets.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.ai-providers.provider");
}

#[test]
fn test_lmstudio_validate_ok_with_optional_api_key() {
    let secrets = AISecrets::LmStudio {
        base_url: "http://localhost:1234".to_string(),
        api_key: None,
    };

    assert!(secrets.validate().is_ok());
}

#[test]
fn test_lmstudio_validate_empty_base_url_fails() {
    let secrets = AISecrets::LmStudio {
        base_url: "  ".to_string(),
        api_key: Some("key".to_string()),
    };

    let result = secrets.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.ai-providers.provider");
}

// ============================================================================
// AI SECRETS - SERDE
// ============================================================================

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
fn test_ai_secrets_invalid_provider_fails() {
    let json = r#"{
        "provider": "unknown",
        "apiKey": "value"
    }"#;

    let result: Result<AISecrets, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail for unsupported provider");
}

// ============================================================================
// AI PROFILE - VALIDATION
// ============================================================================

#[test]
fn test_ai_profile_validate_ok_with_secrets() {
    let profile = AIProfile {
        id: "profile-1".to_string(),
        title: Some("Main profile".to_string()),
        secrets: Some(AISecrets::OpenRouter {
            api_key: "key-123".to_string(),
        }),
        last_used_model: None,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        last_used_at: None,
    };

    assert!(profile.validate().is_ok());
}

#[test]
fn test_ai_profile_validate_ok_without_secrets() {
    let profile = AIProfile {
        id: "profile-2".to_string(),
        title: None,
        secrets: None,
        last_used_model: None,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        last_used_at: None,
    };

    assert!(profile.validate().is_ok());
}

#[test]
fn test_ai_profile_validate_empty_id_fails() {
    let profile = AIProfile {
        id: "".to_string(),
        title: Some("Profile".to_string()),
        secrets: None,
        last_used_model: None,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        last_used_at: None,
    };

    let result = profile.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.ai-providers.provider");
}

#[test]
fn test_ai_profile_validate_title_too_long_fails() {
    let profile = AIProfile {
        id: "profile-3".to_string(),
        title: Some("a".repeat(129)),
        secrets: None,
        last_used_model: None,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        last_used_at: None,
    };

    let result = profile.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.ai-providers.title");
}

#[test]
fn test_ai_profile_validate_invalid_nested_secrets_fails() {
    let profile = AIProfile {
        id: "profile-4".to_string(),
        title: Some("Profile".to_string()),
        secrets: Some(AISecrets::OpenRouter {
            api_key: "".to_string(),
        }),
        last_used_model: None,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        last_used_at: None,
    };

    let result = profile.validate_for_input();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.ai-providers.provider");
}
