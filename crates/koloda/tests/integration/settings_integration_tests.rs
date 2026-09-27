use koloda::app::error::error_codes;
use koloda::domain::settings::SettingsName;
use koloda::repo::settings;
use serde_json::json;

use crate::common::{counted_daily_limit, interface_settings, learning_settings, test_db, valid_learning_defaults};

#[test]
fn set_settings_updates_row_and_sets_updated_at() {
    let db = test_db();

    let created = settings::set_settings(
        &db,
        SettingsName::Interface,
        interface_settings("en", "system", "system"),
    )
    .expect("initial settings insert should succeed");
    assert!(created.updated_at.is_none());

    let updated = settings::set_settings(&db, SettingsName::Interface, interface_settings("ru", "dark", "off"))
        .expect("settings update should succeed");

    assert_eq!(created.id, updated.id, "upsert should update existing row");
    assert!(updated.updated_at.is_some(), "updated_at should be set after update");
    assert_eq!(updated.content["language"], "ru");
    assert_eq!(updated.content["scheme"], "dark");
    assert_eq!(updated.content["motion"], "off");
}

#[test]
fn patch_settings_merges_nested_fields_without_overwriting_unpatched_values() {
    let db = test_db();

    settings::set_settings(&db, SettingsName::Learning, learning_settings(100, 20, 30, 50))
        .expect("initial learning settings insert should succeed");

    let patched = settings::patch_settings(
        &db,
        SettingsName::Learning,
        json!({
            "dailyLimits": {
                "learn": {
                    "value": 7
                }
            },
            "defaults": {
                "algorithm": "01900000-0000-7000-8000-00000000007b"
            }
        }),
    )
    .expect("patch should succeed");

    assert_eq!(patched.content["dailyLimits"]["total"], 100);
    assert_eq!(
        patched.content["dailyLimits"]["untouched"],
        counted_daily_limit(20, true)
    );
    assert_eq!(patched.content["dailyLimits"]["learn"], counted_daily_limit(7, true));
    assert_eq!(patched.content["dailyLimits"]["review"], counted_daily_limit(50, true));
    assert_eq!(
        patched.content["defaults"]["algorithm"],
        "01900000-0000-7000-8000-00000000007b"
    );
    assert!(patched.updated_at.is_some());
}

#[test]
fn patch_settings_deletes_null_keys_so_schema_defaults_refill() {
    let db = test_db();

    let learning = json!({
        "defaults": valid_learning_defaults(),
        "dailyLimits": {
            "total": 40,
            "untouched": counted_daily_limit(10, true),
            "learn": counted_daily_limit(5, false),
            "review": counted_daily_limit(20, true),
        },
        "dayStartsAt": "05:00",
        "learnAheadLimit": [0, 30],
    });
    settings::set_settings(&db, SettingsName::Learning, learning)
        .expect("initial learning settings insert should succeed");

    let patched = settings::patch_settings(
        &db,
        SettingsName::Learning,
        json!({
            "dailyLimits": {
                "learn": {
                    "value": null
                }
            }
        }),
    )
    .expect("patch should succeed");

    // Twin: "deletes a patched null key so the schema default refills" in
    // libs/db-sqlite/src/lib/settings-reviews.integration.test.ts. RFC 7386
    // deletes `value`; the learn default (0) refills while `counts` survives.
    assert_eq!(patched.content["dailyLimits"]["total"], 40);
    assert_eq!(patched.content["dailyLimits"]["learn"], counted_daily_limit(0, false));
    assert_eq!(
        patched.content["dailyLimits"]["untouched"],
        counted_daily_limit(10, true)
    );
    assert_eq!(patched.content["dailyLimits"]["review"], counted_daily_limit(20, true));
}

#[test]
fn patch_settings_replaces_arrays_wholesale() {
    let db = test_db();

    settings::set_settings(
        &db,
        SettingsName::Ai,
        json!({
            "profiles": [
                {
                    "id": "01900000-0000-7000-8000-000000000001",
                    "title": "First",
                    "whitelistModelIds": ["openai/gpt-4"],
                    "createdAt": "2026-01-01T00:00:00Z"
                },
                {
                    "id": "01900000-0000-7000-8000-000000000002",
                    "title": "Second",
                    "createdAt": "2026-01-02T00:00:00Z"
                }
            ]
        }),
    )
    .expect("initial AI settings insert should succeed");

    let patched = settings::patch_settings(
        &db,
        SettingsName::Ai,
        json!({
            "profiles": [
                {
                    "id": "01900000-0000-7000-8000-000000000001",
                    "title": "Renamed",
                    "createdAt": "2026-01-01T00:00:00Z"
                }
            ]
        }),
    )
    .expect("patch should succeed");

    // Twin: "replaces arrays wholesale instead of element-merging" in
    // libs/db-sqlite/src/lib/settings-reviews.integration.test.ts. The whole
    // array is replaced — one profile, and fields the patch omits do not survive.
    let profiles = patched.content["profiles"]
        .as_array()
        .expect("profiles should be an array");
    assert_eq!(profiles.len(), 1);
    assert_eq!(profiles[0]["id"], "01900000-0000-7000-8000-000000000001");
    assert_eq!(profiles[0]["title"], "Renamed");
    assert!(profiles[0].get("whitelistModelIds").is_none());
}

#[test]
fn set_settings_preserves_false_counts_flag() {
    let db = test_db();

    let saved = settings::set_settings(
        &db,
        SettingsName::Learning,
        json!({
            "defaults": {
                "algorithm": "01900000-0000-7000-8000-000000000001",
                "template": "01900000-0000-7000-8000-000000000002"
            },
            "dailyLimits": {
                "total": 100,
                "untouched": {
                    "value": 20,
                    "counts": false
                },
                "learn": counted_daily_limit(30, true),
                "review": counted_daily_limit(50, true)
            },
            "dayStartsAt": "04:00",
            "learnAheadLimit": [0, 30]
        }),
    )
    .expect("learning settings insert should succeed");

    assert_eq!(
        saved.content["dailyLimits"]["untouched"],
        counted_daily_limit(20, false)
    );
}

#[test]
fn patch_settings_rejects_invalid_content_and_preserves_previous_value() {
    let db = test_db();

    settings::set_settings(&db, SettingsName::Learning, learning_settings(100, 20, 30, 50))
        .expect("initial learning settings insert should succeed");

    let patch_result = settings::patch_settings(
        &db,
        SettingsName::Learning,
        json!({
            "dayStartsAt": "25:00"
        }),
    );

    assert!(patch_result.is_err(), "invalid patch should fail validation");

    let current = settings::get_settings(&db, SettingsName::Learning)
        .expect("settings query should succeed")
        .expect("learning settings should exist");

    assert_eq!(current.content["dayStartsAt"], "04:00");
}

#[test]
fn patch_settings_fails_when_target_setting_does_not_exist() {
    let db = test_db();

    let result = settings::patch_settings(
        &db,
        SettingsName::Learning,
        json!({
            "dayStartsAt": "03:00"
        }),
    );

    assert_eq!(result.expect_err("patch should fail").code, error_codes::DB_UPDATE);
}

#[test]
fn patch_settings_rejects_non_uuid_default_and_preserves_previous_value() {
    let db = test_db();

    settings::set_settings(&db, SettingsName::Learning, learning_settings(100, 20, 30, 50))
        .expect("initial learning settings insert should succeed");

    let patch_result = settings::patch_settings(
        &db,
        SettingsName::Learning,
        json!({
            "defaults": {
                "algorithm": "simple"
            }
        }),
    );

    assert_eq!(
        patch_result.expect_err("patch should fail").code,
        error_codes::VALIDATION_SETTINGS_LEARNING_DEFAULTS_ALGORITHM
    );

    let current = settings::get_settings(&db, SettingsName::Learning)
        .expect("settings query should succeed")
        .expect("learning settings should exist");

    assert_eq!(
        current.content["defaults"]["algorithm"],
        "01900000-0000-7000-8000-000000000001"
    );
}

#[test]
fn set_settings_rejects_plaintext_ai_api_key() {
    let db = test_db();

    let result = settings::set_settings(
        &db,
        SettingsName::Ai,
        json!({
            "profiles": [
                {
                    "id": "01900000-0000-7000-8000-000000000001",
                    "title": "OpenRouter",
                    "secrets": {
                        "provider": "openrouter",
                        "apiKey": "sk-live-secret-key"
                    },
                    "createdAt": "2026-01-01T00:00:00Z"
                }
            ]
        }),
    );

    assert_eq!(
        result.expect_err("set_settings should fail").code,
        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_API_KEY
    );
}

#[test]
fn patch_settings_rejects_plaintext_ai_api_key() {
    let db = test_db();

    settings::set_settings(
        &db,
        SettingsName::Ai,
        json!({
            "profiles": [
                {
                    "id": "01900000-0000-7000-8000-000000000001",
                    "title": "OpenRouter",
                    "secrets": {
                        "provider": "openrouter",
                        "apiKey": null
                    },
                    "createdAt": "2026-01-01T00:00:00Z"
                }
            ]
        }),
    )
    .expect("redacted AI settings should be storable");

    let result = settings::patch_settings(
        &db,
        SettingsName::Ai,
        json!({
            "profiles": [
                {
                    "id": "01900000-0000-7000-8000-000000000001",
                    "title": "OpenRouter",
                    "secrets": {
                        "provider": "openrouter",
                        "apiKey": "sk-live-secret-key"
                    },
                    "createdAt": "2026-01-01T00:00:00Z"
                }
            ]
        }),
    );

    assert_eq!(
        result.expect_err("patch_settings should fail").code,
        error_codes::VALIDATION_SETTINGS_AI_PROVIDERS_API_KEY
    );
}
