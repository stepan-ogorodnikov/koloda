use koloda_native_tauri::app::error::error_codes;
use koloda_native_tauri::domain::settings::SettingsName;
use koloda_native_tauri::repo::settings;
use serde_json::json;

mod common;
use common::{interface_settings, learning_settings, test_db};

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
    assert_eq!(updated.content["theme"], "dark");
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
                "learn": 7
            },
            "defaults": {
                "algorithm": 123
            }
        }),
    )
    .expect("patch should succeed");

    assert_eq!(patched.content["dailyLimits"]["total"], 100);
    assert_eq!(patched.content["dailyLimits"]["untouched"], 20);
    assert_eq!(patched.content["dailyLimits"]["learn"], 7);
    assert_eq!(patched.content["dailyLimits"]["review"], 50);
    assert_eq!(patched.content["defaults"]["algorithm"], 123);
    assert!(patched.updated_at.is_some());
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

    assert!(result.is_err());
    assert_eq!(result.expect_err("patch should fail").code, error_codes::DB_UPDATE);
}
