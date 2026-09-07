use koloda::domain::settings::SettingsName;
use koloda::domain::settings_hotkeys::HotkeysSettings;

#[test]
fn test_valid_hotkeys_settings_full() {
    // WHY: dashboard carries two bindings so this single config also pins that multi-key actions
    // are accepted, and "Control+Comma" covers modifier spellings.
    let json = r#"{
        "navigation": {
            "dashboard": ["KeyH", "KeyJ"],
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
    settings.validate().unwrap();
}

#[test]
fn test_empty_json_object_defaults_all_scopes() {
    // WHY: every scope carries #[serde(default)], so `{}` exercises the default path for all five
    // fields at once and validate() must accept the resulting empty maps.
    let json = r#"{}"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    assert!(settings.validate().is_ok(), "Empty JSON should default all scopes");
}

#[test]
fn test_unknown_action_names_pass_validation() {
    // WHY: the per-scope whitelists only feed fill_defaults(); validate() never inspects action
    // names, so unknown entries inside any scope map must deserialize and validate cleanly.
    for scope in ["navigation", "grades"] {
        let content = serde_json::json!({
            scope: { "extraAction": ["X"] }
        });

        let settings: HotkeysSettings = serde_json::from_value(content).expect("Should deserialize");
        assert!(
            settings.validate().is_ok(),
            "Unknown action name in {scope} should be accepted"
        );
    }
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
    settings.validate().unwrap();
}

#[test]
fn test_duplicate_keys_fail_with_code() {
    // WHY: one per-scope HashSet backs every within-scope duplicate, so same-action,
    // cross-action, grades-side, and later-in-array spellings all funnel through the same
    // rejection path and error code.
    for (label, json) in [
        (
            "duplicate within one action",
            r#"{
                "navigation": { "dashboard": ["ArrowRight", "ArrowRight"] },
                "grades": {}
            }"#,
        ),
        (
            "duplicate across actions in the same scope",
            r#"{
                "navigation": { "dashboard": ["ArrowRight"], "decks": ["ArrowRight"] },
                "grades": {}
            }"#,
        ),
        (
            "duplicate within a grade action",
            r#"{
                "navigation": {},
                "grades": { "again": ["Digit1", "Digit1"] }
            }"#,
        ),
        (
            "duplicate across grade actions",
            r#"{
                "navigation": {},
                "grades": { "again": ["Digit1"], "hard": ["Digit1"] }
            }"#,
        ),
        (
            "duplicate later in the same array",
            r#"{
                "navigation": { "dashboard": ["ArrowRight", "KeyJ", "ArrowRight"] },
                "grades": {}
            }"#,
        ),
    ] {
        let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
        let result = settings.validate();
        assert_eq!(
            result.expect_err("Duplicate keys must fail validation").code,
            "validation.settings-hotkeys.duplicate-keys",
            "{label}: duplicates must surface validation.settings-hotkeys.duplicate-keys"
        );
    }
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
fn test_duplicate_keys_between_ui_and_navigation_fails() {
    let json = r#"{
        "ui": {
            "focusNext": ["Space"]
        },
        "navigation": {
            "dashboard": ["Space"]
        },
        "grades": {}
    }"#;

    let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert_eq!(
        result.expect_err("Same key in ui and navigation should fail").code,
        "validation.settings-hotkeys.duplicate-keys"
    );
}

#[test]
fn test_settings_name_hotkeys_validation_with_non_object_content() {
    let content = serde_json::json!("not an object");

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
    result.unwrap();
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
    assert_eq!(result.unwrap_err().code, "validation.settings-hotkeys.duplicate-keys");
}
