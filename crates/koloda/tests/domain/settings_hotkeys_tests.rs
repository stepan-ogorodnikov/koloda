use std::collections::HashMap;

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
    // WHY: stripping is normalize/fill_defaults's job; validate stays duplicate-only so reads of
    // dirty JSON do not fail before strip.
    for (scope, json) in [
        ("navigation", r#"{"navigation":{"extraAction":["X"]}}"#),
        ("grades", r#"{"grades":{"extraAction":["X"]}}"#),
    ] {
        let settings: HotkeysSettings = serde_json::from_str(json).expect("Should deserialize");
        let extra_present = match scope {
            "navigation" => settings.navigation.contains_key("extraAction"),
            "grades" => settings.grades.contains_key("extraAction"),
            other => panic!("unexpected scope {other}"),
        };
        assert!(extra_present, "{scope}.extraAction must still be present before strip");
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

#[test]
fn test_hotkeys_normalize_drops_unknown_action_names() {
    // WHY: Zod strips unknown action keys; desktop must do the same on normalize so retired
    // names (e.g. toggleCardsMode) are not persisted and do not fail reads.
    for (scope, known_action, known_binding, unknown_action, missing_action) in [
        ("form", "submit", "Mod+S", "retiredFormAction", "reset"),
        ("ui", "close", "Alt+C", "legacyUiAction", "focusNext"),
        ("navigation", "dashboard", "KeyH", "extraAction", "decks"),
        ("grades", "again", "Digit1", "retiredGrade", "hard"),
        ("ai", "cancel", "Mod+Shift+I", "toggleCardsMode", "focusPrompt"),
    ] {
        let mut actions = serde_json::Map::new();
        actions.insert(known_action.to_string(), serde_json::json!([known_binding]));
        actions.insert(unknown_action.to_string(), serde_json::json!(["X"]));
        let mut root = serde_json::Map::new();
        root.insert(scope.to_string(), serde_json::Value::Object(actions));
        let content = serde_json::Value::Object(root);

        let normalized = SettingsName::Hotkeys
            .normalize(content)
            .expect("unknown action names must not reject normalize");
        let scope_map = normalized[scope]
            .as_object()
            .unwrap_or_else(|| panic!("{scope} must serialize as an object"));

        assert!(
            !scope_map.contains_key(unknown_action),
            "{scope}: {unknown_action} must be dropped"
        );
        assert_eq!(
            scope_map.get(known_action),
            Some(&serde_json::json!([known_binding])),
            "{scope}: known binding for {known_action} must be kept"
        );
        assert_eq!(
            scope_map.get(missing_action),
            Some(&serde_json::json!([])),
            "{scope}: missing known action {missing_action} must be filled with []"
        );
    }
}

fn sorted_scope_keys(map: &HashMap<String, Vec<String>>) -> Vec<String> {
    let mut keys: Vec<String> = map.keys().cloned().collect();
    keys.sort();
    keys
}

fn sorted_ts_keys(keys: &[&str]) -> Vec<String> {
    let mut expected: Vec<String> = keys.iter().map(|key| (*key).to_string()).collect();
    expected.sort();
    expected
}

#[test]
fn test_hotkeys_scope_action_ids_match_ts() {
    // INVARIANT: TS↔Rust twin (agents/TESTING.md) — per-scope action ids must stay in sync with
    // the TS `hotkeys` const in `libs/app/src/lib/settings-hotkeys.ts`, pinned in
    // `libs/app/src/lib/settings-hotkeys.test.ts`. Adding a hotkey requires touching both pins
    // (agents/ADD-HOTKEY.md).
    let mut settings: HotkeysSettings =
        serde_json::from_value(serde_json::json!({})).expect("empty object deserializes");
    settings.fill_defaults();

    assert_eq!(sorted_scope_keys(&settings.form), sorted_ts_keys(&["submit", "reset"]));
    assert_eq!(
        sorted_scope_keys(&settings.ui),
        sorted_ts_keys(&[
            "submit",
            "focusNext",
            "focusPrev",
            "nextTab",
            "prevTab",
            "close",
            "toggleSidebarControls",
            "toggleColorScheme",
        ])
    );
    assert_eq!(
        sorted_scope_keys(&settings.navigation),
        sorted_ts_keys(&["dashboard", "decks", "algorithms", "templates", "settings", "ai"])
    );
    assert_eq!(
        sorted_scope_keys(&settings.grades),
        sorted_ts_keys(&["again", "hard", "normal", "easy"])
    );
    assert_eq!(
        sorted_scope_keys(&settings.ai),
        sorted_ts_keys(&[
            "cancel",
            "focusPrompt",
            "newConversation",
            "openModelPicker",
            "previousConversation",
            "nextConversation",
            "toggleSettings",
            "scrollUp",
            "scrollDown",
            "scrollToTop",
            "scrollToBottom",
        ])
    );
}
