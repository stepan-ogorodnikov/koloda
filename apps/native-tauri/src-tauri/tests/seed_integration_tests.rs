use koloda_native_tauri::app::init::seed_db_with_database;
use koloda_native_tauri::domain::settings::SettingsName;
use koloda_native_tauri::domain::templates::{TemplateContent, TemplateField, TemplateLayoutItem};
use koloda_native_tauri::repo::{algorithms, settings, templates};

mod common;
use common::{fsrs_algorithm_content, seed_data, test_db};

#[test]
fn seed_db_is_idempotent_and_reuses_oldest_algorithm_and_template() {
    let db = test_db();

    seed_db_with_database(&db, seed_data("Algorithm A", "Template A")).expect("first seed should succeed");
    seed_db_with_database(&db, seed_data("Algorithm B", "Template B")).expect("second seed should succeed");

    let all_algorithms = algorithms::get_algorithms(&db).expect("algorithms query should succeed");
    let all_templates = templates::get_templates(&db).expect("templates query should succeed");

    assert_eq!(all_algorithms.len(), 1, "seed should not duplicate algorithms");
    assert_eq!(all_templates.len(), 1, "seed should not duplicate templates");

    let learning = settings::get_settings(&db, SettingsName::Learning)
        .expect("settings query should succeed")
        .expect("learning settings should exist");

    assert_eq!(learning.content["defaults"]["algorithm"], all_algorithms[0].id);
    assert_eq!(learning.content["defaults"]["template"], all_templates[0].id);
}

#[test]
fn seed_db_reuses_oldest_existing_algorithm_and_template_ids() {
    let db = test_db();

    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO algorithms (id, title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL)",
            rusqlite::params![10_i64, "Algo older", fsrs_algorithm_content().to_string(), 100_i64],
        )?;
        conn.execute(
            "INSERT INTO algorithms (id, title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL)",
            rusqlite::params![11_i64, "Algo newer", fsrs_algorithm_content().to_string(), 200_i64],
        )?;

        conn.execute(
            "INSERT INTO templates (id, title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL)",
            rusqlite::params![
                20_i64,
                "Tpl older",
                serde_json::to_string(&TemplateContent {
                    fields: vec![
                        TemplateField {
                            id: 1,
                            title: "Front".to_string(),
                            field_type: "text".to_string(),
                            is_required: true,
                        },
                        TemplateField {
                            id: 2,
                            title: "Back".to_string(),
                            field_type: "text".to_string(),
                            is_required: false,
                        },
                    ],
                    layout: vec![
                        TemplateLayoutItem {
                            field: 1,
                            operation: "display".to_string(),
                        },
                        TemplateLayoutItem {
                            field: 2,
                            operation: "reveal".to_string(),
                        },
                    ],
                })
                .expect("template content should serialize"),
                100_i64
            ],
        )?;
        conn.execute(
            "INSERT INTO templates (id, title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL)",
            rusqlite::params![
                21_i64,
                "Tpl newer",
                serde_json::to_string(&TemplateContent {
                    fields: vec![
                        TemplateField {
                            id: 1,
                            title: "Front".to_string(),
                            field_type: "text".to_string(),
                            is_required: true,
                        },
                        TemplateField {
                            id: 2,
                            title: "Back".to_string(),
                            field_type: "text".to_string(),
                            is_required: false,
                        },
                    ],
                    layout: vec![
                        TemplateLayoutItem {
                            field: 1,
                            operation: "display".to_string(),
                        },
                        TemplateLayoutItem {
                            field: 2,
                            operation: "reveal".to_string(),
                        },
                    ],
                })
                .expect("template content should serialize"),
                200_i64
            ],
        )?;
        Ok(())
    })
    .expect("fixture inserts should succeed");

    seed_db_with_database(&db, seed_data("Algorithm ignored", "Template ignored")).expect("seed should succeed");

    let learning = settings::get_settings(&db, SettingsName::Learning)
        .expect("settings query should succeed")
        .expect("learning settings should exist");

    assert_eq!(learning.content["defaults"]["algorithm"], 10);
    assert_eq!(learning.content["defaults"]["template"], 20);

    let all_algorithms = algorithms::get_algorithms(&db).expect("algorithms query should succeed");
    let all_templates = templates::get_templates(&db).expect("templates query should succeed");
    assert_eq!(all_algorithms.len(), 2, "seed should reuse existing algorithms");
    assert_eq!(all_templates.len(), 2, "seed should reuse existing templates");
}

#[test]
fn seed_db_persists_interface_learning_and_hotkeys_settings() {
    let db = test_db();

    seed_db_with_database(&db, seed_data("Algorithm A", "Template A")).expect("seed should succeed");

    let interface = settings::get_settings(&db, SettingsName::Interface)
        .expect("settings query should succeed")
        .expect("interface settings should exist");
    let learning = settings::get_settings(&db, SettingsName::Learning)
        .expect("settings query should succeed")
        .expect("learning settings should exist");
    let hotkeys = settings::get_settings(&db, SettingsName::Hotkeys)
        .expect("settings query should succeed")
        .expect("hotkeys settings should exist");

    assert_eq!(interface.content["language"], "en");
    assert_eq!(learning.content["dayStartsAt"], "04:00");
    assert!(hotkeys.content["navigation"].is_object());
}
