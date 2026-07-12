use koloda_core::app::init::{seed_db, SeedData, SeedSettings};
use koloda_core::domain::algorithms::InsertAlgorithmData;
use koloda_core::domain::settings::SettingsName;
use koloda_core::repo::{algorithms, settings};
use serde_json::json;

mod common;
use common::{counted_daily_limit, fsrs_content, simple_template, test_db};

#[test]
fn e2e_seed_and_review_workflow() {
    let db = test_db();

    seed_db(
        &db,
        SeedData {
            algorithm: InsertAlgorithmData {
                title: "Default FSRS".to_string(),
                content: fsrs_content(),
            },
            template: simple_template(),
            settings: SeedSettings {
                interface: json!({"language": "en", "scheme": "system", "lightTheme": "atom-one-light", "darkTheme": "atom-one-dark", "motion": "system"}),
                learning: json!({
                    "defaults": {},
                    "dailyLimits": {
                        "total": 100,
                        "untouched": counted_daily_limit(20, true),
                        "learn": counted_daily_limit(30, true),
                        "review": counted_daily_limit(50, true)
                    },
                    "dayStartsAt": "04:00",
                    "learnAheadLimit": [4, 0],
                }),
                hotkeys: json!({
                    "navigation": {"dashboard": ["KeyH"], "decks": ["KeyD"]},
                    "grades": {"again": ["Digit1"], "hard": ["Digit2"], "normal": ["Digit3"], "easy": ["Digit4"]},
                }),
            },
        },
    )
    .expect("seed should succeed");

    let algorithms = algorithms::get_algorithms(&db).expect("should get algorithms");
    assert_eq!(algorithms.len(), 1, "should have default algorithm");

    let settings = settings::get_settings(&db, SettingsName::Learning)
        .expect("should get settings")
        .expect("learning settings should exist");
    assert!(settings.content.get("defaults").is_some());
}
