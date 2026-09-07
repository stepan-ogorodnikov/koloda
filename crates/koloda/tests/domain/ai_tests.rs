use koloda::domain::ai::{AIProfile, AISecrets};

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

// WHY: Ollama and LmStudio share the same `z.url()` twin; one table covers both providers
// so a parse-guard regression cannot hide on only one arm.
type LocalProviderRow = (&'static str, fn(String) -> AISecrets);
const LOCAL_PROVIDER_ROWS: &[LocalProviderRow] = &[
    ("ollama", |base_url| AISecrets::Ollama {
        base_url,
        api_key: None,
    }),
    ("lmstudio", |base_url| AISecrets::LmStudio {
        base_url,
        api_key: None,
    }),
];

#[test]
fn test_local_providers_input_rejects_non_url_base_url() {
    for &(provider, build) in LOCAL_PROVIDER_ROWS {
        let secrets = build("not-a-url".to_string());
        let via_validate = secrets.validate();
        assert_eq!(
            via_validate.unwrap_err().code,
            "validation.settings-ai.providers.baseUrl",
            "{provider} validate must reject a non-URL baseUrl"
        );
        let via_input = secrets.validate_for_input();
        assert_eq!(
            via_input.unwrap_err().code,
            "validation.settings-ai.providers.baseUrl",
            "{provider} validate_for_input must reject a non-URL baseUrl"
        );
    }
}

#[test]
fn test_local_providers_storage_rejects_non_url_base_url() {
    for &(provider, build) in LOCAL_PROVIDER_ROWS {
        let result = build("not-a-url".to_string()).validate_for_storage();
        assert_eq!(
            result.unwrap_err().code,
            "validation.settings-ai.providers.baseUrl",
            "{provider} validate_for_storage must reject a non-URL baseUrl"
        );
    }
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

// WHY: These variants share an identical single-field `{ api_key }` payload, so their
// accept/reject/alias contracts collapse into one table; `openrouter` mirrors the input rules
// but anchors the storage-redaction cases, so its tests stay explicit above.
type KeyedProviderRow = (&'static str, &'static str, fn(Option<String>) -> AISecrets);
const KEYED_PROVIDER_ROWS: &[KeyedProviderRow] = &[
    ("opencodeGo", "go-secret", |api_key| AISecrets::OpencodeGo { api_key }),
    ("opencodeZen", "zen-secret", |api_key| AISecrets::OpencodeZen {
        api_key,
    }),
    ("ollamaCloud", "cloud-secret", |api_key| AISecrets::OllamaCloud {
        api_key,
    }),
];

#[test]
fn test_keyed_providers_require_non_blank_api_key() {
    for &(provider, secret, build) in KEYED_PROVIDER_ROWS {
        let secrets = build(Some(secret.to_string()));
        secrets.validate().unwrap();
        assert_eq!(secrets.provider(), provider, "{provider} reports its provider id");
        assert_eq!(secrets.api_key(), Some(secret), "{provider} exposes its stored key");

        for api_key in [None, Some("  ".to_string())] {
            let result = build(api_key).validate();
            // WHY: absent and whitespace-only keys funnel through the same trimmed check,
            // so both rejections surface `validation.settings-ai.providers.apiKey`.
            assert_eq!(
                result.unwrap_err().code,
                "validation.settings-ai.providers.apiKey",
                "{provider} must reject a missing or blank apiKey"
            );
        }
    }
}

#[test]
fn test_keyed_providers_deserialize_api_key_alias() {
    for &(provider, ..) in KEYED_PROVIDER_ROWS {
        let json = format!(r#"{{ "provider": "{provider}", "api_key": "alias-key" }}"#);

        let secrets: AISecrets = serde_json::from_str(&json).expect("Should deserialize with api_key alias");
        assert_eq!(secrets.provider(), provider);
        assert_eq!(secrets.api_key(), Some("alias-key"));
    }
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
fn test_ai_profile_validate_title_max_length_in_cyrillic_ok() {
    // 128 Cyrillic chars are 256 UTF-8 bytes — byte counting would reject the
    // title the TS zod mirror (UTF-16 units) accepts.
    let profile = AIProfile {
        id: "profile-5".to_string(),
        title: Some("ф".repeat(128)),
        secrets: None,
        has_secrets: false,
        whitelist_model_ids: None,
        created_at: TEST_CREATED_AT,
    };

    profile.validate().unwrap();
}

#[test]
fn test_ai_profile_validate_title_one_past_max_length_in_cyrillic_fails() {
    let profile = AIProfile {
        id: "profile-6".to_string(),
        title: Some("ф".repeat(129)),
        secrets: None,
        has_secrets: false,
        whitelist_model_ids: None,
        created_at: TEST_CREATED_AT,
    };

    let result = profile.validate();
    assert_eq!(result.unwrap_err().code, "validation.common.title.too-long");
}

#[test]
fn test_ai_profile_validate_title_max_length_in_emoji_fails() {
    // 64 emoji are 128 UTF-16 units (2 per astral char), 65 are 130 — char counting
    // would accept the title the TS zod mirror (UTF-16 units) rejects.
    let profile = AIProfile {
        id: "profile-7".to_string(),
        title: Some("🦀".repeat(65)),
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
    use koloda::domain::ai::UpdateProfileData;

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

#[test]
fn ai_secrets_provider_tags_match_ts_registry() {
    use koloda::domain::ai::AISecrets;

    // INVARIANT: TS↔Rust twin (agents/TESTING.md) — the serialized `provider`
    // tags must stay in sync with the TS registry keys pinned in
    // `libs/ai/src/lib/provider-registry.test.ts`. Adding a provider requires
    // touching both pins (agents/ADD-AI-PROVIDER.md).
    let variants = [
        AISecrets::OpenRouter { api_key: None },
        AISecrets::Ollama {
            base_url: "http://localhost".into(),
            api_key: None,
        },
        AISecrets::LmStudio {
            base_url: "http://localhost".into(),
            api_key: None,
        },
        AISecrets::OpencodeGo { api_key: None },
        AISecrets::OpencodeZen { api_key: None },
        AISecrets::OllamaCloud { api_key: None },
    ];

    let mut tags: Vec<String> = variants
        .iter()
        .map(|variant| {
            let value = serde_json::to_value(variant).expect("AISecrets serializes");
            value
                .get("provider")
                .and_then(|tag| tag.as_str())
                .expect("tagged enum carries a provider tag")
                .to_string()
        })
        .collect();
    tags.sort();

    assert_eq!(
        tags,
        vec![
            "lmstudio".to_string(),
            "ollama".to_string(),
            "ollamaCloud".to_string(),
            "opencodeGo".to_string(),
            "opencodeZen".to_string(),
            "openrouter".to_string(),
        ]
    );
}
