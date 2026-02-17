use koloda_native_tauri::domain::settings_learning::LearningSettings;

// ============================================================================
// VALID SETTINGS TESTS
// ============================================================================

#[test]
fn test_valid_settings_passes() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {
            "total": 100,
            "untouched": 20,
            "learn": 30,
            "review": 50
        },
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize valid JSON");
    assert!(settings.validate().is_ok());
}

// ============================================================================
// MISSING FIELDS TESTS
// ============================================================================

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
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "learnAheadLimit": [4, 0]
    }"#;

    let result: Result<LearningSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when dayStartsAt is missing");
}

#[test]
fn test_missing_learn_ahead_limit_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
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

// ============================================================================
// EXTRA FIELDS TESTS
// ============================================================================

#[test]
fn test_settings_with_extra_fields_ignored() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0],
        "nonexistent": "ignored",
        "another": 123
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize ignoring extra fields");
    assert!(settings.validate().is_ok());
}

// ============================================================================
// DAILY LIMITS TESTS
// ============================================================================

#[test]
fn test_daily_limits_zero_total_allows_any_values() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {
            "total": 0,
            "untouched": 999,
            "learn": 999,
            "review": 999
        },
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok(), "Zero total should allow any values");
}

#[test]
fn test_daily_limits_untouched_exceeds_total_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {
            "total": 100,
            "untouched": 101,
            "learn": 30,
            "review": 50
        },
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when untouched exceeds total");
}

#[test]
fn test_daily_limits_learn_exceeds_total_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {
            "total": 100,
            "untouched": 20,
            "learn": 101,
            "review": 50
        },
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when learn exceeds total");
}

#[test]
fn test_daily_limits_review_exceeds_total_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {
            "total": 100,
            "untouched": 20,
            "learn": 30,
            "review": 101
        },
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when review exceeds total");
}

#[test]
fn test_daily_limits_exact_total_ok() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {
            "total": 100,
            "untouched": 100,
            "learn": 0,
            "review": 0
        },
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok(), "Exact total should be valid");
}

// ============================================================================
// DAY STARTS AT TESTS
// ============================================================================

#[test]
fn test_day_starts_at_valid_format_ok() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_day_starts_at_boundary_hours_23_ok() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "23:00",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_day_starts_at_boundary_minutes_59_ok() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:59",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_day_starts_at_hours_too_high_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "24:00",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when hours > 23");
}

#[test]
fn test_day_starts_at_minutes_too_high_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:60",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when minutes > 59");
}

#[test]
fn test_day_starts_at_invalid_format_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "invalid",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail with invalid format");
}

#[test]
fn test_day_starts_at_missing_colon_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "0400",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail without colon");
}

#[test]
fn test_day_starts_at_too_many_parts_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:00:00",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail with too many parts");
}

#[test]
fn test_day_starts_at_as_number_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": 400,
        "learnAheadLimit": [4, 0]
    }"#;

    let result: Result<LearningSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when dayStartsAt is a number");
}

// ============================================================================
// LEARN AHEAD LIMIT TESTS
// ============================================================================

#[test]
fn test_learn_ahead_limit_valid_ok() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_learn_ahead_limit_boundary_hours_48_ok() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:00",
        "learnAheadLimit": [48, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_learn_ahead_limit_boundary_minutes_59_ok() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:00",
        "learnAheadLimit": [0, 59]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_learn_ahead_limit_minutes_too_high_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:00",
        "learnAheadLimit": [0, 60]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when minutes > 59");
}

#[test]
fn test_learn_ahead_limit_hours_too_high_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:00",
        "learnAheadLimit": [49, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_err(), "Should fail when hours > 48");
}

#[test]
fn test_learn_ahead_limit_zero_ok() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:00",
        "learnAheadLimit": [0, 0]
    }"#;

    let settings: LearningSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_learn_ahead_limit_as_object_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:00",
        "learnAheadLimit": {"hours": 4, "minutes": 0}
    }"#;

    let result: Result<LearningSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when learnAheadLimit is an object");
}

#[test]
fn test_learn_ahead_limit_as_string_fails() {
    let json = r#"{
        "defaults": {},
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:00",
        "learnAheadLimit": "4:00"
    }"#;

    let result: Result<LearningSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when learnAheadLimit is a string");
}

// ============================================================================
// SETTINGS_NAME DISPATCHER TESTS
// ============================================================================

use koloda_native_tauri::domain::settings::SettingsName;

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
        "dailyLimits": {"total": 100, "untouched": 20, "learn": 30, "review": 50},
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0]
    });
    let result = SettingsName::Learning.validate(&content);
    assert!(result.is_ok());
}
