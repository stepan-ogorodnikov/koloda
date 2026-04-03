use koloda_native_tauri::domain::settings::SettingsName;
use koloda_native_tauri::domain::settings_learning::LearningSettings;

fn standard_daily_limits() -> &'static str {
    r#"{
        "total": 100,
        "untouched": {"value": 20, "counts": true},
        "learn": {"value": 30, "counts": true},
        "review": {"value": 50, "counts": true}
    }"#
}

fn build_learning_settings_json(daily_limits: &str, day_starts_at: &str, learn_ahead_limit: &str) -> String {
    format!(
        r#"{{
        "defaults": {{}},
        "dailyLimits": {},
        "dayStartsAt": {},
        "learnAheadLimit": {}
    }}"#,
        daily_limits, day_starts_at, learn_ahead_limit
    )
}

#[test]
fn test_valid_settings_passes() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""04:00""#, "[4, 0]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize valid JSON");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_legacy_numeric_daily_limits_are_accepted() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize legacy JSON");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_missing_daily_limits_fails() {
    let json = r#"{
        "defaults": {},
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0]
    }"#;

    let result: Result<LearningSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when dailyLimits is missing");
}

#[test]
fn test_missing_day_starts_at_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": {"value": 20, "counts": true}, "learn": {"value": 30, "counts": true}, "review": {"value": 50, "counts": true}},
        "learnAheadLimit": [4, 0]
    }"#;

    let result: Result<LearningSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when dayStartsAt is missing");
}

#[test]
fn test_missing_learn_ahead_limit_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": {"value": 20, "counts": true}, "learn": {"value": 30, "counts": true}, "review": {"value": 50, "counts": true}},
        "dayStartsAt": "04:00"
    }"#;

    let result: Result<LearningSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when learnAheadLimit is missing");
}

#[test]
fn test_empty_json_object_fails() {
    let json = r#"{}"#;

    let result: Result<LearningSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail with empty JSON");
}

#[test]
fn test_settings_with_extra_fields_ignored() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": {"value": 20, "counts": true}, "learn": {"value": 30, "counts": true}, "review": {"value": 50, "counts": true}},
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0],
        "nonexistent": "ignored",
        "another": 123
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize ignoring extra fields");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_daily_limits_zero_total_allows_any_values() {
    let json = build_learning_settings_json(
        r#"{
            "total": 0,
            "untouched": {"value": 999, "counts": true},
            "learn": {"value": 999, "counts": true},
            "review": {"value": 999, "counts": true}
        }"#,
        r#""04:00""#,
        "[4, 0]",
    );

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_ok(), "Zero total should allow any values");
}

#[test]
fn test_daily_limits_untouched_exceeds_total_fails() {
    let json = build_learning_settings_json(
        r#"{
            "total": 100,
            "untouched": {"value": 101, "counts": true},
            "learn": {"value": 30, "counts": true},
            "review": {"value": 50, "counts": true}
        }"#,
        r#""04:00""#,
        "[4, 0]",
    );

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when untouched exceeds total");
}

#[test]
fn test_daily_limits_learn_exceeds_total_fails() {
    let json = build_learning_settings_json(
        r#"{
            "total": 100,
            "untouched": {"value": 20, "counts": true},
            "learn": {"value": 101, "counts": true},
            "review": {"value": 50, "counts": true}
        }"#,
        r#""04:00""#,
        "[4, 0]",
    );

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when learn exceeds total");
}

#[test]
fn test_daily_limits_review_exceeds_total_fails() {
    let json = build_learning_settings_json(
        r#"{
            "total": 100,
            "untouched": {"value": 20, "counts": true},
            "learn": {"value": 30, "counts": true},
            "review": {"value": 101, "counts": true}
        }"#,
        r#""04:00""#,
        "[4, 0]",
    );

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when review exceeds total");
}

#[test]
fn test_daily_limits_exact_total_ok() {
    let json = build_learning_settings_json(
        r#"{
            "total": 100,
            "untouched": {"value": 100, "counts": true},
            "learn": {"value": 0, "counts": true},
            "review": {"value": 0, "counts": true}
        }"#,
        r#""04:00""#,
        "[4, 0]",
    );

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_ok(), "Exact total should be valid");
}

#[test]
fn test_non_counted_limit_can_exceed_total() {
    let json = build_learning_settings_json(
        r#"{
            "total": 100,
            "untouched": {"value": 101, "counts": false},
            "learn": {"value": 30, "counts": true},
            "review": {"value": 50, "counts": true}
        }"#,
        r#""04:00""#,
        "[4, 0]",
    );

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(
        settings.validate().is_ok(),
        "Non-counted limits should not be capped by total"
    );
}

#[test]
fn test_day_starts_at_valid_format_ok() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""04:00""#, "[4, 0]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_day_starts_at_boundary_hours_23_ok() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""23:00""#, "[4, 0]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_day_starts_at_boundary_minutes_59_ok() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""04:59""#, "[4, 0]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_day_starts_at_hours_too_high_fails() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""24:00""#, "[4, 0]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when hours > 23");
}

#[test]
fn test_day_starts_at_minutes_too_high_fails() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""04:60""#, "[4, 0]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when minutes > 59");
}

#[test]
fn test_day_starts_at_invalid_format_fails() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""invalid""#, "[4, 0]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail with invalid format");
}

#[test]
fn test_day_starts_at_missing_colon_fails() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""0400""#, "[4, 0]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail without colon");
}

#[test]
fn test_day_starts_at_too_many_parts_fails() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""04:00:00""#, "[4, 0]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail with too many parts");
}

#[test]
fn test_day_starts_at_as_number_fails() {
    let json = build_learning_settings_json(standard_daily_limits(), "400", "[4, 0]");

    let result: Result<LearningSettings, _> = serde_json::from_str(&json);
    assert!(result.is_err(), "Should fail when dayStartsAt is a number");
}

#[test]
fn test_learn_ahead_limit_valid_ok() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""04:00""#, "[4, 0]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_learn_ahead_limit_boundary_hours_48_ok() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""04:00""#, "[48, 0]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_learn_ahead_limit_boundary_minutes_59_ok() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""04:00""#, "[0, 59]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_learn_ahead_limit_minutes_too_high_fails() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""04:00""#, "[0, 60]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when minutes > 59");
}

#[test]
fn test_learn_ahead_limit_hours_too_high_fails() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""04:00""#, "[49, 0]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when hours > 48");
}

#[test]
fn test_learn_ahead_limit_zero_ok() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""04:00""#, "[0, 0]");

    let settings: LearningSettings = serde_json::from_str(&json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_learn_ahead_limit_as_object_fails() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""04:00""#, r#"{"hours": 4, "minutes": 0}"#);

    let result: Result<LearningSettings, _> = serde_json::from_str(&json);
    assert!(result.is_err(), "Should fail when learnAheadLimit is an object");
}

#[test]
fn test_learn_ahead_limit_as_string_fails() {
    let json = build_learning_settings_json(standard_daily_limits(), r#""04:00""#, r#""4:00""#);

    let result: Result<LearningSettings, _> = serde_json::from_str(&json);
    assert!(result.is_err(), "Should fail when learnAheadLimit is a string");
}

#[test]
fn test_settings_name_learning_validation_with_non_object_content() {
    let content = serde_json::json!("not an object");
    let result = SettingsName::Learning.validate(&content);
    assert!(result.is_err());
}

#[test]
fn test_settings_name_learning_validation_with_array_content() {
    let content = serde_json::json!([1, 2, 3]);
    let result = SettingsName::Learning.validate(&content);
    assert!(result.is_err());
}

#[test]
fn test_settings_name_learning_validation_valid() {
    let content = serde_json::json!({
        "defaults": {},
        "dailyLimits": {
            "total": 100,
            "untouched": {"value": 20, "counts": true},
            "learn": {"value": 30, "counts": true},
            "review": {"value": 50, "counts": true}
        },
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0]
    });
    let result = SettingsName::Learning.validate(&content);
    assert!(result.is_ok());
}
