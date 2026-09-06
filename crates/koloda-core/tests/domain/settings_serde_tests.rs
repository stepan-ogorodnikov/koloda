use koloda_core::domain::settings::{Settings, SettingsName};
use koloda_core::domain::settings_learning::{
    CountedDailyLimit, DailyLimits, LearnAheadLimit, LearningDefaults, LearningSettings,
};
use serde_json::json;

#[test]
fn test_settings_name_uses_kebab_case() {
    for (name, wire) in [
        (SettingsName::Interface, "interface"),
        (SettingsName::Learning, "learning"),
        (SettingsName::Hotkeys, "hotkeys"),
        (SettingsName::Ai, "ai"),
    ] {
        assert_eq!(serde_json::to_value(name).unwrap(), json!(wire));
        assert_eq!(serde_json::from_value::<SettingsName>(json!(wire)).unwrap(), name);
    }

    // The wire name is kebab-case only — casing variants must reject, matching
    // the `SettingsName` union in `@koloda/settings`.
    for wrong in ["Interface", "AI", "learningSettings"] {
        assert!(
            serde_json::from_value::<SettingsName>(json!(wrong)).is_err(),
            "{wrong} must reject"
        );
    }
}

/// Pins the settings row envelope as it crosses the NAPI layer: `content` is
/// the embedded JSON object (never a stringified column), `name` is kebab-case.
/// Unlike `Review`/`Card`, timestamps stay i64 millis — the renderer only ever
/// consumes `content` (main unwraps the row), so this pins reality as-is.
#[test]
fn test_settings_row_serializes_wire_shape() {
    let row = Settings {
        id: 3,
        name: SettingsName::Learning,
        content: json!({ "dayStartsAt": "04:00" }),
        created_at: 1_700_000_000_000,
        updated_at: None,
    };

    assert_eq!(
        serde_json::to_value(&row).unwrap(),
        json!({
            "id": 3,
            "name": "learning",
            "content": { "dayStartsAt": "04:00" },
            "createdAt": 1_700_000_000_000_i64,
            "updatedAt": null,
        })
    );
}

/// The row `content` is the settings payload itself: keys must arrive camelCase
/// to match `@koloda/app` `learningSettingsValidation`, and the learn-ahead
/// limit is a two-number array, not an object.
#[test]
fn test_learning_content_uses_camel_case_keys() {
    let learning = LearningSettings {
        defaults: LearningDefaults {
            algorithm: 1,
            template: 2,
        },
        daily_limits: DailyLimits {
            total: 10,
            untouched: CountedDailyLimit {
                value: 5,
                counts: false,
            },
            learn: CountedDailyLimit {
                value: 20,
                counts: true,
            },
            review: CountedDailyLimit {
                value: 20,
                counts: true,
            },
        },
        day_starts_at: "04:00".to_string(),
        learn_ahead_limit: LearnAheadLimit(0, 30),
    };

    assert_eq!(
        serde_json::to_value(&learning).unwrap(),
        json!({
            "defaults": { "algorithm": 1, "template": 2 },
            "dailyLimits": {
                "total": 10,
                "untouched": { "value": 5, "counts": false },
                "learn": { "value": 20, "counts": true },
                "review": { "value": 20, "counts": true },
            },
            "dayStartsAt": "04:00",
            "learnAheadLimit": [0, 30],
        })
    );
}
