use koloda::domain::settings::SettingsName;
use koloda::domain::settings_interface::InterfaceSettings;

#[test]
fn test_valid_interface_settings_full() {
    let json = r#"{
        "language": "en",
        "scheme": "system",
        "lightTheme": "atom-one-light",
        "darkTheme": "atom-one-dark",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize valid JSON");
    settings.validate().unwrap();
}

#[test]
fn test_missing_themes_default_to_github() {
    let json = r#"{
        "language": "en",
        "scheme": "system",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    assert_eq!(settings.light_theme, "github-light");
    assert_eq!(settings.dark_theme, "github-dark");
    settings.validate().unwrap();
}

#[test]
fn test_missing_required_fields_fail() {
    let base = serde_json::json!({
        "language": "en",
        "scheme": "system",
        "motion": "system"
    });

    // WHY: language/scheme/motion carry no serde default, so omitting any one of them fails
    // identically at deserialization; only the themes are optional (pinned above).
    for field in ["language", "scheme", "motion"] {
        let mut content = base.clone();
        content.as_object_mut().unwrap().remove(field);

        let result: Result<InterfaceSettings, _> = serde_json::from_value(content);
        assert!(result.is_err(), "Should fail when {field} is missing");
    }
}

#[test]
fn test_extra_fields_ignored() {
    let json = r#"{
        "language": "en",
        "scheme": "system",
        "motion": "system",
        "nonexistent": "ignored",
        "another": 123
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize ignoring extra fields");
    settings.validate().unwrap();
}

#[test]
fn test_invalid_language_fails() {
    // WHY: validate() does a plain membership check against LANGUAGES, so unknown, empty, and
    // wrong-case spellings all funnel through the same rejection path and error code.
    for language in ["invalid", "", "EN"] {
        let content = serde_json::json!({
            "language": language,
            "scheme": "system",
            "motion": "system"
        });

        let settings: InterfaceSettings = serde_json::from_value(content).expect("Should deserialize");
        let result = settings.validate();
        assert_eq!(
            result.expect_err("Should fail with invalid language").code,
            "validation.settings-interface.language",
            "language {language:?} must be rejected"
        );
    }
}

#[test]
fn test_invalid_scheme_fails() {
    // WHY: same membership check as language, so one table covers unknown, empty, and
    // capitalized spellings of scheme.
    for scheme in ["blue", "", "Light"] {
        let content = serde_json::json!({
            "language": "en",
            "scheme": scheme,
            "motion": "system"
        });

        let settings: InterfaceSettings = serde_json::from_value(content).expect("Should deserialize");
        let result = settings.validate();
        assert_eq!(
            result.expect_err("Should fail with invalid scheme").code,
            "validation.settings-interface.scheme",
            "scheme {scheme:?} must be rejected"
        );
    }
}

#[test]
fn test_invalid_light_theme_fails() {
    let json = r#"{
        "language": "en",
        "scheme": "system",
        "lightTheme": "solarized",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert_eq!(
        result.expect_err("Should fail with invalid light theme").code,
        "validation.settings-interface.light-theme"
    );
}

#[test]
fn test_invalid_dark_theme_fails() {
    let json = r#"{
        "language": "en",
        "scheme": "system",
        "darkTheme": "solarized",
        "motion": "system"
    }"#;

    let settings: InterfaceSettings = serde_json::from_str(json).expect("Should deserialize");
    let result = settings.validate();
    assert_eq!(
        result.expect_err("Should fail with invalid dark theme").code,
        "validation.settings-interface.dark-theme"
    );
}

#[test]
fn test_invalid_motion_fails() {
    // WHY: motion joins the same membership-check family; unknown, empty, and capitalized
    // values share one rejection path and error code.
    for motion in ["partial", "", "On"] {
        let content = serde_json::json!({
            "language": "en",
            "scheme": "system",
            "motion": motion
        });

        let settings: InterfaceSettings = serde_json::from_value(content).expect("Should deserialize");
        let result = settings.validate();
        assert_eq!(
            result.expect_err("Should fail with invalid motion").code,
            "validation.settings-interface.motion",
            "motion {motion:?} must be rejected"
        );
    }
}

#[test]
fn test_settings_name_interface_validation_with_non_object_content() {
    let content = serde_json::json!("not an object");

    let result = SettingsName::Interface.validate(&content);
    assert!(result.is_err());
}

#[test]
fn test_settings_name_interface_all_valid_combinations() {
    let languages = vec!["en", "ru"];
    let schemes = vec!["light", "dark", "system"];
    let motions = vec!["on", "off", "system"];

    for lang in &languages {
        for scheme in &schemes {
            for motion in &motions {
                let content = serde_json::json!({
                    "language": lang,
                    "scheme": scheme,
                    "motion": motion
                });

                assert!(
                    SettingsName::Interface.validate(&content).is_ok(),
                    "Should be valid: lang={}, scheme={}, motion={}",
                    lang,
                    scheme,
                    motion
                );
            }
        }
    }
}
