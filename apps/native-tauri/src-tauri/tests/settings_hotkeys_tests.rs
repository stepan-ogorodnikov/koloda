use koloda_native_tauri::domain::settings::SettingsName;
use koloda_native_tauri::domain::settings_hotkeys::HotkeysSettings;

// ============================================================================
// VALID SETTINGS TESTS
// ============================================================================

#[test]
fn test_valid_hotkeys_settings_full() {
    let json = r#"{
        "navigation": {
            "dashboard": ["KeyH"],
            "decks": ["KeyD"],
            "algorithms": ["KeyP"],
            "templates": ["KeyT"],
            "settings": ["Control+Comma"]
        },
        "grades": {
            "again": ["Digit1"],
            "hard": ["Digit2"],
            "normal": ["Digit3"],
            "easy": ["Digit4"]
        }
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize valid JSON");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_empty_navigation_and_grades() {
    let json = r#"{
        "navigation": {},
        "grades": {}
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_empty_navigation_with_valid_grades() {
    let json = r#"{
        "navigation": {},
        "grades": {
            "again": ["Digit1"]
        }
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_empty_grades_with_valid_navigation() {
    let json = r#"{
        "navigation": {
            "dashboard": ["ArrowRight"]
        },
        "grades": {}
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_single_key_binding() {
    let json = r#"{
        "navigation": {},
        "grades": {
            "again": ["Space"]
        }
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_multiple_key_bindings_per_action() {
    let json = r#"{
        "navigation": {
            "dashboard": ["ArrowRight", "KeyJ"]
        },
        "grades": {}
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_multiple_actions_with_unique_keys() {
    let json = r#"{
        "navigation": {
            "dashboard": ["ArrowRight"],
            "decks": ["ArrowLeft"],
            "algorithms": ["Space"]
        },
        "grades": {}
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

#[test]
fn test_key_bindings_with_modifiers() {
    let json = r#"{
        "navigation": {
            "dashboard": ["Control+ArrowRight", "Meta+ArrowRight"]
        },
        "grades": {}
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok());
}

// ============================================================================
// MISSING FIELDS TESTS
// ============================================================================

#[test]
fn test_missing_navigation_fails() {
    let json = r#"{
        "grades": {
            "again": ["Digit1"]
        }
    }"#;

    let result: Result<HotkeysSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when navigation is missing");
}

#[test]
fn test_missing_grades_fails() {
    let json = r#"{
        "navigation": {
            "dashboard": ["ArrowRight"]
        }
    }"#;

    let result: Result<HotkeysSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when grades is missing");
}

#[test]
fn test_empty_json_object_fails() {
    let json = r#"{}"#;

    let result: Result<HotkeysSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail with empty JSON");
}

// ============================================================================
// EXTRA FIELDS TESTS
// ============================================================================

#[test]
fn test_extra_navigation_fields_ignored() {
    let json = r#"{
        "navigation": {
            "dashboard": ["ArrowRight"],
            "extraKey": ["X"]
        },
        "grades": {}
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok(), "Should ignore extra navigation keys");
}

#[test]
fn test_extra_grades_fields_ignored() {
    let json = r#"{
        "navigation": {},
        "grades": {
            "again": ["Digit1"],
            "extraKey": ["X"]
        }
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok(), "Should ignore extra grades keys");
}

#[test]
fn test_extra_top_level_fields_ignored() {
    let json = r#"{
        "navigation": {"dashboard": ["ArrowRight"]},
        "grades": {"again": ["Digit1"]},
        "extraField": "ignored",
        "anotherExtra": 123
    }"#;

    let settings: HotkeysSettings =
        serde_json::from_str(json).expect("Should deserialize ignoring extra top-level fields");
    assert!(settings.validate().is_ok());
}

// ============================================================================
// DUPLICATE KEY TESTS
// ============================================================================

#[test]
fn test_duplicate_keys_in_same_action_fails() {
    let json = r#"{
        "navigation": {
            "dashboard": ["ArrowRight", "ArrowRight"]
        },
        "grades": {}
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(result.is_err(), "Should fail with duplicate keys in same action");
    assert_eq!(result.unwrap_err().code, "validation.settings-hotkeys.duplicate-keys");
}

#[test]
fn test_duplicate_keys_in_different_actions_same_scope_fails() {
    let json = r#"{
        "navigation": {
            "dashboard": ["ArrowRight"],
            "decks": ["ArrowRight"]
        },
        "grades": {}
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(
        result.is_err(),
        "Should fail with duplicate keys across actions in same scope"
    );
    assert_eq!(result.unwrap_err().code, "validation.settings-hotkeys.duplicate-keys");
}

#[test]
fn test_duplicate_keys_between_scopes_allowed() {
    let json = r#"{
        "navigation": {
            "dashboard": ["Space"]
        },
        "grades": {
            "again": ["Space"]
        }
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(
        settings.validate().is_ok(),
        "Same key in different scopes should be allowed"
    );
}

#[test]
fn test_duplicate_keys_in_grades_fails() {
    let json = r#"{
        "navigation": {},
        "grades": {
            "again": ["Digit1", "Digit1"]
        }
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(result.is_err(), "Should fail with duplicate keys in grades");
    assert_eq!(result.unwrap_err().code, "validation.settings-hotkeys.duplicate-keys");
}

#[test]
fn test_duplicate_keys_across_different_grade_actions_fails() {
    let json = r#"{
        "navigation": {},
        "grades": {
            "again": ["Digit1"],
            "hard": ["Digit1"]
        }
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(result.is_err(), "Should fail with duplicate keys across grade actions");
    assert_eq!(result.unwrap_err().code, "validation.settings-hotkeys.duplicate-keys");
}

#[test]
fn test_duplicate_in_middle_of_multiple_keys_fails() {
    let json = r#"{
        "navigation": {
            "dashboard": ["ArrowRight", "KeyJ", "ArrowRight"]
        },
        "grades": {}
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert!(result.is_err(), "Should fail when duplicate appears later in array");
    assert_eq!(result.unwrap_err().code, "validation.settings-hotkeys.duplicate-keys");
}

// ============================================================================
// INVALID TYPE TESTS
// ============================================================================

#[test]
fn test_navigation_as_array_fails() {
    let json = r#"{
        "navigation": ["ArrowRight"],
        "grades": {}
    }"#;

    let result: Result<HotkeysSettings, _> = serde_json::from_str(json);
    assert!(
        result.is_err(),
        "Should fail when navigation is an array instead of object"
    );
}

#[test]
fn test_navigation_as_string_fails() {
    let json = r#"{
        "navigation": "invalid",
        "grades": {}
    }"#;

    let result: Result<HotkeysSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when navigation is a string");
}

#[test]
fn test_grades_as_array_fails() {
    let json = r#"{
        "navigation": {},
        "grades": ["Digit1"]
    }"#;

    let result: Result<HotkeysSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when grades is an array instead of object");
}

#[test]
fn test_grades_as_string_fails() {
    let json = r#"{
        "navigation": {},
        "grades": "invalid"
    }"#;

    let result: Result<HotkeysSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when grades is a string");
}

#[test]
fn test_keys_as_string_instead_of_array_fails() {
    let json = r#"{
        "navigation": {
            "dashboard": "ArrowRight"
        },
        "grades": {}
    }"#;

    let result: Result<HotkeysSettings, _> = serde_json::from_str(json);
    assert!(
        result.is_err(),
        "Should fail when key binding is a string instead of array"
    );
}

#[test]
fn test_keys_as_number_fails() {
    let json = r#"{
        "navigation": {
            "dashboard": [123]
        },
        "grades": {}
    }"#;

    let result: Result<HotkeysSettings, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when key is a number instead of string");
}

// ============================================================================
// SETTINGS_NAME DISPATCHER TESTS
// ============================================================================

#[test]
fn test_settings_name_hotkeys_validation_with_non_object_content() {
    let content = serde_json::json!("not an object");

    let result = SettingsName::Hotkeys.validate(&content);
    assert!(result.is_err());
}

#[test]
fn test_settings_name_hotkeys_validation_with_array_content() {
    let content = serde_json::json!([1, 2, 3]);

    let result = SettingsName::Hotkeys.validate(&content);
    assert!(result.is_err());
}

#[test]
fn test_settings_name_hotkeys_validation_via_json() {
    let json = r#"{
        "navigation": {
            "dashboard": ["ArrowRight"]
        },
        "grades": {
            "again": ["Digit1"]
        }
    }"#;

    let content: serde_json::Value = serde_json::from_str(json).expect("Should parse JSON");
    let result = SettingsName::Hotkeys.validate(&content);
    assert!(result.is_ok());
}

#[test]
fn test_settings_name_hotkeys_validation_with_duplicates() {
    let json = r#"{
        "navigation": {
            "dashboard": ["ArrowRight"],
            "decks": ["ArrowRight"]
        },
        "grades": {}
    }"#;

    let content: serde_json::Value = serde_json::from_str(json).expect("Should parse JSON");
    let result = SettingsName::Hotkeys.validate(&content);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.settings-hotkeys.duplicate-keys");
}

#[test]
fn test_settings_name_hotkeys_validation_empty() {
    let json = r#"{
        "navigation": {},
        "grades": {}
    }"#;

    let content: serde_json::Value = serde_json::from_str(json).expect("Should parse JSON");
    let result = SettingsName::Hotkeys.validate(&content);
    assert!(result.is_ok());
}

#[test]
fn test_settings_name_hotkeys_validation_missing_field() {
    let json = r#"{
        "navigation": {}
    }"#;

    let content: serde_json::Value = serde_json::from_str(json).expect("Should parse JSON");
    let result = SettingsName::Hotkeys.validate(&content);
    assert!(result.is_err());
}
