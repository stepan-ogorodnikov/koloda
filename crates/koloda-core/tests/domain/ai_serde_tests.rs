use koloda_core::domain::settings_ai::{AIProfile, AISecrets};
use serde_json::json;

/// Pins the public-profile wire shape: `secrets` is omitted entirely (not
/// null) when stripped, and `hasSecrets` is the renderer's only signal that a
/// key exists in the keyring.
#[test]
fn test_public_profile_omits_secrets() {
    let profile = AIProfile {
        id: "profile-1".to_string(),
        title: Some("Main".to_string()),
        secrets: None,
        has_secrets: true,
        whitelist_model_ids: Some(vec!["model-a".to_string()]),
        created_at: 1_699_999_000_000,
    };

    let value = serde_json::to_value(&profile).unwrap();

    assert_eq!(
        value,
        json!({
            "id": "profile-1",
            "title": "Main",
            "hasSecrets": true,
            "whitelistModelIds": ["model-a"],
            "createdAt": "2023-11-14T21:56:40+00:00",
        })
    );
    assert!(value.get("secrets").is_none(), "secrets key must be absent, not null");
}

/// Pins the absent-vs-empty distinction on the model allowlist (`[]` means
/// none, absence means all models) and the redacted-secret shape: stored
/// rows keep `secrets` with `apiKey: null` under the provider tag.
#[test]
fn test_redacted_profile_keeps_empty_allowlist_and_null_key() {
    let profile = AIProfile {
        id: "profile-1".to_string(),
        title: None,
        secrets: Some(AISecrets::OpenRouter { api_key: None }),
        has_secrets: false,
        whitelist_model_ids: Some(vec![]),
        created_at: 1_699_999_000_000,
    };

    let value = serde_json::to_value(&profile).unwrap();

    assert_eq!(
        value,
        json!({
            "id": "profile-1",
            "title": null,
            "secrets": { "provider": "openrouter", "apiKey": null },
            "hasSecrets": false,
            "whitelistModelIds": [],
            "createdAt": "2023-11-14T21:56:40+00:00",
        })
    );
}

#[test]
fn test_secret_key_deserialization_contract() {
    // Redacted rows: `null` deserializes to no key.
    let redacted: AISecrets = serde_json::from_value(json!({ "provider": "openrouter", "apiKey": null })).unwrap();
    assert_eq!(redacted.provider(), "openrouter");
    assert_eq!(redacted.api_key(), None);

    // WHY: legacy rows stored `""` for absent keys; they must keep deserializing.
    let legacy: AISecrets = serde_json::from_value(json!({ "provider": "openrouter", "apiKey": "" })).unwrap();
    assert_eq!(legacy.provider(), "openrouter");
    assert_eq!(legacy.api_key(), None);

    // Snake-case alias accepted for hand-edited/older settings payloads.
    let alias: AISecrets = serde_json::from_value(json!({ "provider": "openrouter", "api_key": "sk-1" })).unwrap();
    assert_eq!(alias.provider(), "openrouter");
    assert_eq!(alias.api_key(), Some("sk-1"));
}
