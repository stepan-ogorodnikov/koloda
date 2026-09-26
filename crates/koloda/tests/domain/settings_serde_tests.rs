use koloda::domain::settings::{Settings, SettingsName};
use koloda::domain::settings_learning::{
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
/// the embedded JSON object (never a stringified column), `name` is kebab-case,
/// and timestamps serialize as RFC 3339 strings like every other entity — the
/// renderer reviver turns them into `Date`, matching `Timestamps` in `@koloda/app`.
#[test]
fn test_settings_row_serializes_wire_shape() {
    let row = Settings {
        id: 3,
        name: SettingsName::Learning,
        content: json!({ "dayStartsAt": "04:00" }),
        created_at: 1_700_000_000_000,
        updated_at: None,
    };

    let wire = serde_json::to_value(&row).unwrap();
    assert_eq!(
        wire,
        json!({
            "id": 3,
            "name": "learning",
            "content": { "dayStartsAt": "04:00" },
            "createdAt": "2023-11-14T22:13:20+00:00",
            "updatedAt": null,
        })
    );

    // The RFC 3339 wire form round-trips back to the stored unix-ms integer.
    let parsed: Settings = serde_json::from_value(wire).unwrap();
    assert_eq!(parsed.created_at, 1_700_000_000_000);
    assert_eq!(parsed.updated_at, None);
}

/// The row `content` is the settings payload itself: keys must arrive camelCase
/// to match `@koloda/app` `learningSettingsValidation`, and the learn-ahead
/// limit is a two-number array, not an object.
#[test]
fn test_learning_content_uses_camel_case_keys() {
    let learning = LearningSettings {
        defaults: LearningDefaults {
            algorithm: "01900000-0000-7000-8000-000000000001".to_string(),
            template: "01900000-0000-7000-8000-000000000002".to_string(),
        },
        daily_limits: DailyLimits {
            total: Some(10),
            untouched: CountedDailyLimit {
                value: Some(5),
                counts: false,
            },
            learn: CountedDailyLimit {
                value: Some(20),
                counts: true,
            },
            review: CountedDailyLimit {
                value: Some(20),
                counts: true,
            },
        },
        day_starts_at: "04:00".to_string(),
        learn_ahead_limit: LearnAheadLimit(0, 30),
    };

    assert_eq!(
        serde_json::to_value(&learning).unwrap(),
        json!({
            "defaults": { "algorithm": "01900000-0000-7000-8000-000000000001", "template": "01900000-0000-7000-8000-000000000002" },
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
