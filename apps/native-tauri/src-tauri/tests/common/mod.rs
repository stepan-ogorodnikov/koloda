#![allow(dead_code)]

use koloda_native_tauri::app::db::Database;
use serde_json::json;

pub mod fixtures;

pub fn test_db() -> Database {
    Database::in_memory().expect("in-memory database should initialize")
}

pub fn fsrs_algorithm_content() -> serde_json::Value {
    json!({
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.4197,1.1869,3.0412,15.2441,7.1434,0.6477,1.0007,0.0754,1.6598,0.1719,1.1178,1.4699,0.134,0.016,1.7101,0.1543,0.9369,2.9664,0.714,0.201,0.0059",
        "isFuzzEnabled": true,
        "learningSteps": [[10, "m"], [1, "d"]],
        "relearningSteps": [[10, "m"]],
        "maximumInterval": 36500,
    })
}

pub fn fsrs_content() -> serde_json::Value {
    fsrs_algorithm_content()
}

pub fn card_content(
    front: &str,
    back: &str,
) -> std::collections::HashMap<String, koloda_native_tauri::domain::cards::CardContentField> {
    std::collections::HashMap::from([
        (
            "1".to_string(),
            koloda_native_tauri::domain::cards::CardContentField {
                text: front.to_string(),
            },
        ),
        (
            "2".to_string(),
            koloda_native_tauri::domain::cards::CardContentField { text: back.to_string() },
        ),
    ])
}

pub fn simple_template_content() -> koloda_native_tauri::domain::templates::TemplateContent {
    use koloda_native_tauri::domain::templates::{TemplateContent, TemplateField, TemplateLayoutItem};

    TemplateContent {
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
    }
}

pub fn simple_template() -> koloda_native_tauri::domain::templates::InsertTemplateData {
    use koloda_native_tauri::domain::templates::InsertTemplateData;

    InsertTemplateData {
        title: "Basic".to_string(),
        content: simple_template_content(),
    }
}

pub fn interface_settings(language: &str, theme: &str, motion: &str) -> serde_json::Value {
    json!({
        "language": language,
        "theme": theme,
        "motion": motion,
    })
}

pub fn learning_settings(total: u32, untouched: u32, learn: u32, review: u32) -> serde_json::Value {
    json!({
        "defaults": {},
        "dailyLimits": {
            "total": total,
            "untouched": untouched,
            "learn": learn,
            "review": review,
        },
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0],
    })
}

pub fn learning_settings_with_day_start(
    total: u32,
    untouched: u32,
    learn: u32,
    review: u32,
    day_starts_at: &str,
) -> serde_json::Value {
    json!({
        "defaults": {},
        "dailyLimits": {
            "total": total,
            "untouched": untouched,
            "learn": learn,
            "review": review,
        },
        "dayStartsAt": day_starts_at,
        "learnAheadLimit": [4, 0],
    })
}

pub fn hotkeys_settings() -> serde_json::Value {
    json!({
        "navigation": {
            "dashboard": ["H"],
            "decks": ["D"],
            "algorithms": ["P"],
            "templates": ["T"],
            "settings": ["Mod+,"],
        },
        "grades": {
            "again": ["1"],
            "hard": ["2"],
            "normal": ["3"],
            "easy": ["4"],
        },
    })
}

pub fn seed_data(algorithm_title: &str, template_title: &str) -> koloda_native_tauri::app::init::SeedData {
    use koloda_native_tauri::app::init::SeedSettings;
    use koloda_native_tauri::domain::algorithms::InsertAlgorithmData;
    use koloda_native_tauri::domain::templates::InsertTemplateData;

    koloda_native_tauri::app::init::SeedData {
        algorithm: InsertAlgorithmData {
            title: algorithm_title.to_string(),
            content: fsrs_algorithm_content(),
        },
        template: InsertTemplateData {
            title: template_title.to_string(),
            content: simple_template_content(),
        },
        settings: SeedSettings {
            interface: interface_settings("en", "system", "system"),
            learning: learning_settings(100, 20, 30, 50),
            hotkeys: hotkeys_settings(),
        },
    }
}
