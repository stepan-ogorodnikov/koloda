use koloda_native_tauri::domain::settings::SettingsName;
use koloda_native_tauri::domain::settings_interface::InterfaceSettings;

// ============================================================================
// VALID
// ============================================================================

#[test]
fn test_valid_interface_settings_full() {
    let json = r#"{
        "language": "en",
        "theme": "system",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize valid JSON");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_valid_language_en() {
    let json = r#"{
        "language": "en",
        "theme": "system",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_valid_language_ru() {
    let json = r#"{
        "language": "ru",
        "theme": "system",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_valid_theme_light() {
    let json = r#"{
        "language": "en",
        "theme": "light",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_valid_theme_dark() {
    let json = r#"{
        "language": "en",
        "theme": "dark",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_valid_theme_system() {
    let json = r#"{
        "language": "en",
        "theme": "system",
        "motion": "off"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_valid_motion_on() {
    let json = r#"{
        "language": "en",
        "theme": "system",
        "motion": "on"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_valid_motion_off() {
    let json = r#"{
        "language": "en",
        "theme": "system",
        "motion": "off"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_valid_motion_system() {
    let json = r#"{
        "language": "en",
        "theme": "system",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

// ============================================================================
// MISSING FIELDS
// ============================================================================

#[test]
fn test_missing_language_fails() {
    let json = r#"{
        "theme": "system",
        "motion": "system"
    }"#;

    let result: Result<InterfaceSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when language is missing");
}

#[test]
fn test_missing_theme_fails() {
    let json = r#"{
        "language": "en",
        "motion": "system"
    }"#;

    let result: Result<InterfaceSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when theme is missing");
}

#[test]
fn test_missing_motion_fails() {
    let json = r#"{
        "language": "en",
        "theme": "system"
    }"#;

    let result: Result<InterfaceSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when motion is missing");
}

#[test]
fn test_empty_json_object_fails() {
    let json = r#"{}"#;

    let result: Result<InterfaceSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail with empty JSON");
}

// ============================================================================
// EXSESSIVE FIELDS
// ============================================================================

#[test]
fn test_extra_fields_ignored() {
    let json = r#"{
        "language": "en",
        "theme": "system",
        "motion": "system",
        "nonexistent": "ignored",
        "another": 123
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize ignoring extra fields");
    assert!(settings.validate().is_ok());
}

// ============================================================================
// INVALID LANGUAGE
// ============================================================================

#[test]
fn test_invalid_language_fails() {
    let json = r#"{
        "language": "invalid",
        "theme": "system",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(result.is_err(), "Should fail with invalid language");
    assert_eq!(result.unwrap_err().code, "validation.settings-interface.language");
}

#[test]
fn test_empty_language_fails() {
    let json = r#"{
        "language": "",
        "theme": "system",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(result.is_err(), "Should fail with empty language");
    assert_eq!(result.unwrap_err().code, "validation.settings-interface.language");
}

#[test]
fn test_language_with_different_case_fails() {
    let json = r#"{
        "language": "EN",
        "theme": "light",
        "motion": "off"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(result.is_err(), "Should fail with uppercase language");
    assert_eq!(result.unwrap_err().code, "validation.settings-interface.language");
}

#[test]
fn test_language_invalid_type_fails() {
    let json = r#"{
        "language": 123,
        "theme": "system",
        "motion": "system"
    }"#;

    let result: Result<InterfaceSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when language is a number");
}

#[test]
fn test_language_as_null_fails() {
    let json = r#"{
        "language": null,
        "theme": "system",
        "motion": "system"
    }"#;

    let result: Result<InterfaceSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when language is null");
}

// ============================================================================
// INVALID THEME
// ============================================================================

#[test]
fn test_invalid_theme_fails() {
    let json = r#"{
        "language": "en",
        "theme": "blue",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(result.is_err(), "Should fail with invalid theme");
    assert_eq!(result.unwrap_err().code, "validation.settings-interface.theme");
}

#[test]
fn test_empty_theme_fails() {
    let json = r#"{
        "language": "en",
        "theme": "",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(result.is_err(), "Should fail with empty theme");
    assert_eq!(result.unwrap_err().code, "validation.settings-interface.theme");
}

#[test]
fn test_theme_with_different_case_fails() {
    let json = r#"{
        "language": "en",
        "theme": "Light",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(result.is_err(), "Should fail with capitalized theme");
    assert_eq!(result.unwrap_err().code, "validation.settings-interface.theme");
}

#[test]
fn test_theme_invalid_type_fails() {
    let json = r#"{
        "language": "en",
        "theme": 123,
        "motion": "off"
    }"#;

    let result: Result<InterfaceSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when theme is a number");
}

#[test]
fn test_theme_as_null_fails() {
    let json = r#"{
        "language": "en",
        "theme": null,
        "motion": "system"
    }"#;

    let result: Result<InterfaceSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when theme is null");
}

// ============================================================================
// INVALID MOTION
// ============================================================================

#[test]
fn test_invalid_motion_fails() {
    let json = r#"{
        "language": "en",
        "theme": "system",
        "motion": "partial"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(result.is_err(), "Should fail with invalid motion");
    assert_eq!(result.unwrap_err().code, "validation.settings-interface.motion");
}

#[test]
fn test_empty_motion_fails() {
    let json = r#"{
        "language": "en",
        "theme": "system",
        "motion": ""
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(result.is_err(), "Should fail with empty motion");
    assert_eq!(result.unwrap_err().code, "validation.settings-interface.motion");
}

#[test]
fn test_motion_with_different_case_fails() {
    let json = r#"{
        "language": "en",
        "theme": "system",
        "motion": "On"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(result.is_err(), "Should fail with capitalized motion");
    assert_eq!(result.unwrap_err().code, "validation.settings-interface.motion");
}

#[test]
fn test_motion_as_number_fails() {
    let json = r#"{
        "language": "en",
        "theme": "system",
        "motion": 123
    }"#;

    let result: Result<InterfaceSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when motion is a number");
}

#[test]
fn test_motion_as_null_fails() {
    let json = r#"{
        "language": "en",
        "theme": "light",
        "motion": null
    }"#;

    let result: Result<InterfaceSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when motion is null");
}

// ============================================================================
// SETTINGS_NAME DISPATCHER TESTS
// ============================================================================

#[test]
fn test_settings_name_interface_validation_with_non_object_content() {
    let content = serde_json::json!("not an object");

    let result = SettingsName::Interface.validate(&content);
    assert!(result.is_err());
}

#[test]
fn test_settings_name_interface_validation_with_array_content() {
    let content = serde_json::json!([1, 2, 3]);

    let result = SettingsName::Interface.validate(&content);
    assert!(result.is_err());
}

#[test]
fn test_settings_name_interface_all_valid_combinations() {
    let languages = vec!["en", "ru"];
    let themes = vec!["light", "dark", "system"];
    let motions = vec!["on", "off", "system"];

    for lang in &languages {
        for theme in &themes {
            for motion in &motions {
                let content = serde_json::json!({
                    "language": lang,
                    "theme": theme,
                    "motion": motion
                });

                assert!(
                    SettingsName::Interface.validate(&content).is_ok(),
                    "Should be valid: lang={}, theme={}, motion={}",
                    lang,
                    theme,
                    motion
                );
            }
        }
    }
}
