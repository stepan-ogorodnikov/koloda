//! Product rows written through `koloda`'s repo functions, so capture records them as the app would.

use std::collections::HashMap;

use koloda::app::init::{SeedData, SeedSettings};
use koloda::domain::algorithms::InsertAlgorithmData;
use koloda::domain::cards::{CardContentField, InsertCardData, UpdateCardProgress};
use koloda::domain::decks::{Deck, InsertDeckData, UpdateDeckData, UpdateDeckValues};
use koloda::domain::lessons::LessonResultData;
use koloda::domain::reviews::InsertReviewData;
use koloda::domain::templates::{
    InsertTemplateData, TemplateContent, TemplateField, TemplateLayoutItem, UpdateTemplateData, UpdateTemplateValues,
};
use koloda::repo::sync::repair::Starter;
use koloda::repo::{algorithms, cards, decks, lessons, templates};
use koloda_sync_proto::payload::{Payload, Review};
use serde_json::json;

use crate::common::{system_ms, Device};

pub const FRONT: &str = "01900000-0000-7000-8000-000000000001";
pub const BACK: &str = "01900000-0000-7000-8000-000000000002";

/// An algorithm, a template, a deck on both, and one card.
pub struct Library {
    pub algorithm: String,
    pub template: String,
    pub deck: String,
    pub card: String,
}

/// A `Good` review of a new card, as another device's grade pushes it.
pub fn review(card: &str, now: i64) -> Payload {
    Payload::Review(Review {
        card_id: card.to_string(),
        rating: 3,
        state: 1,
        due_at: now + 600_000,
        stability: 1.0,
        difficulty: 5.0,
        scheduled_days: 0,
        learning_steps: 1,
        time: 10,
        is_ignored: false,
        created_at: now,
    })
}

pub fn starter() -> Starter {
    Starter {
        algorithm: algorithm_data("Starter"),
        template: template_data("Starter"),
    }
}

/// First-run content for a file that starts fresh: the seed rows and settings with a daily total of `total`.
pub fn seed_data(total: u32) -> SeedData {
    SeedData {
        algorithm: algorithm_data("Simple"),
        template: template_data("Basic"),
        settings: SeedSettings {
            learning: learning(total),
            ..seed_settings()
        },
    }
}

/// First-run settings for a blank joiner; `seed_joiner_db` points the learning defaults at the seed ids.
pub fn seed_settings() -> SeedSettings {
    SeedSettings {
        interface: json!({
            "language": "en",
            "scheme": "system",
            "lightTheme": "github-light",
            "darkTheme": "github-dark",
            "motion": "system",
        }),
        learning: learning(100),
        hotkeys: json!({
            "ui": { "focusNext": ["Alt+J"], "focusPrev": ["Alt+K"], "nextTab": ["J"], "prevTab": ["K"] },
            "navigation": {
                "dashboard": ["H"],
                "decks": ["D"],
                "algorithms": ["P"],
                "templates": ["T"],
                "settings": ["Mod+,"],
            },
            "grades": { "again": ["1"], "hard": ["2"], "normal": ["3"], "easy": ["4"] },
        }),
    }
}

fn learning(total: u32) -> serde_json::Value {
    json!({
        "defaults": { "algorithm": "unset", "template": "unset" },
        "dailyLimits": {
            "total": total,
            "untouched": { "value": 20, "counts": true },
            "learn": { "value": 30, "counts": true },
            "review": { "value": 50, "counts": true },
        },
        "dayStartsAt": "04:00",
        "learnAheadLimit": [4, 0],
    })
}

pub fn algorithm_data(title: &str) -> InsertAlgorithmData {
    InsertAlgorithmData {
        title: title.to_string(),
        content: serde_json::from_value(json!({
            "type": "fsrs",
            "retention": 90.0,
            "weights": "0.4197,1.1869,3.0412,15.2441,7.1434,0.6477,1.0007,0.0754,1.6598,0.1719,1.1178,1.4699,0.134,0.016,1.7101,0.1543,0.9369,2.9664,0.714,0.201,0.0059",
            "isFuzzEnabled": true,
            "learningSteps": [[10, "m"], [1, "d"]],
            "relearningSteps": [[10, "m"]],
            "maximumInterval": 36500,
        }))
        .expect("valid FSRS parameters"),
    }
}

pub fn template_data(title: &str) -> InsertTemplateData {
    InsertTemplateData {
        title: title.to_string(),
        content: template_content(),
    }
}

fn template_content() -> TemplateContent {
    TemplateContent {
        fields: vec![
            TemplateField {
                id: FRONT.to_string(),
                title: "Front".to_string(),
                field_type: "text".to_string(),
                is_required: true,
            },
            TemplateField {
                id: BACK.to_string(),
                title: "Back".to_string(),
                field_type: "text".to_string(),
                is_required: false,
            },
        ],
        layout: vec![
            TemplateLayoutItem {
                field: FRONT.to_string(),
                operation: "display".to_string(),
            },
            TemplateLayoutItem {
                field: BACK.to_string(),
                operation: "reveal".to_string(),
            },
        ],
    }
}

impl Device {
    pub fn add_algorithm(&self, title: &str) -> String {
        algorithms::add_algorithm(&self.db, algorithm_data(title))
            .expect("algorithm is created")
            .id
    }

    pub fn add_template(&self, title: &str) -> String {
        templates::add_template(&self.db, template_data(title))
            .expect("template is created")
            .id
    }

    pub fn add_deck(&self, algorithm: &str, template: &str, title: &str) -> String {
        decks::add_deck(
            &self.db,
            InsertDeckData {
                title: title.to_string(),
                algorithm_id: algorithm.to_string(),
                template_id: template.to_string(),
            },
        )
        .expect("deck is created")
        .id
    }

    pub fn add_card(&self, deck: &str, template: &str, front: &str) -> String {
        let content = HashMap::from([
            (
                FRONT.to_string(),
                CardContentField {
                    text: front.to_string(),
                },
            ),
            (
                BACK.to_string(),
                CardContentField {
                    text: "answer".to_string(),
                },
            ),
        ]);
        cards::add_card(
            &self.db,
            InsertCardData {
                deck_id: deck.to_string(),
                template_id: template.to_string(),
                content,
                state: None,
                due_at: None,
                stability: None,
                difficulty: None,
                scheduled_days: None,
                learning_steps: None,
                reps: None,
                lapses: None,
                last_reviewed_at: None,
            },
        )
        .expect("card is created")
        .id
    }

    /// Adds `count` cards to a deck in one commit, as an import does.
    pub fn add_cards(&self, deck: &str, template: &str, count: usize) {
        let cards = (0..count)
            .map(|index| InsertCardData {
                deck_id: deck.to_string(),
                template_id: template.to_string(),
                content: HashMap::from([
                    (
                        FRONT.to_string(),
                        CardContentField {
                            text: format!("card {index}"),
                        },
                    ),
                    (
                        BACK.to_string(),
                        CardContentField {
                            text: "answer".to_string(),
                        },
                    ),
                ]),
                state: None,
                due_at: None,
                stability: None,
                difficulty: None,
                scheduled_days: None,
                learning_steps: None,
                reps: None,
                lapses: None,
                last_reviewed_at: None,
            })
            .collect();
        cards::add_cards(&self.db, cards).expect("cards are added");
    }

    /// The table's ids in order, joined, to compare two files.
    pub fn ids(&self, table: &str) -> String {
        self.text(&format!(
            "SELECT COALESCE(group_concat(id), '') FROM (SELECT id FROM {table} ORDER BY id)"
        ))
    }

    pub fn library(&self) -> Library {
        let algorithm = self.add_algorithm("FSRS");
        let template = self.add_template("Basic");
        let deck = self.add_deck(&algorithm, &template, "Spanish");
        let card = self.add_card(&deck, &template, "hola");
        Library {
            algorithm,
            template,
            deck,
            card,
        }
    }

    pub fn update_deck(&self, deck: &str, title: &str, algorithm: &str, template: &str) {
        decks::update_deck(
            &self.db,
            UpdateDeckData {
                id: deck.to_string(),
                values: UpdateDeckValues {
                    title: title.to_string(),
                    algorithm_id: algorithm.to_string(),
                    template_id: template.to_string(),
                    notes: None,
                },
            },
        )
        .expect("deck is updated");
    }

    pub fn rename_template(&self, template: &str, title: &str) {
        templates::update_template(
            &self.db,
            UpdateTemplateData {
                id: template.to_string(),
                values: UpdateTemplateValues {
                    title: title.to_string(),
                    content: template_content(),
                    notes: None,
                },
            },
        )
        .expect("template is updated");
    }

    /// Grades a new card `Good`, as a lesson submits it: its scheduling and one review in one commit.
    pub fn grade(&self, card: &str) {
        let now = i64::try_from(system_ms()).expect("now fits");
        let due_at = now + 600_000;
        lessons::submit_lesson_result(
            &self.db,
            LessonResultData {
                card: UpdateCardProgress {
                    id: card.to_string(),
                    state: 1,
                    due_at,
                    stability: 1.0,
                    difficulty: 5.0,
                    scheduled_days: 0,
                    learning_steps: 1,
                    reps: 1,
                    lapses: 0,
                    last_reviewed_at: Some(now),
                },
                review: InsertReviewData {
                    card_id: card.to_string(),
                    rating: 3,
                    state: 1,
                    due_at,
                    stability: 1.0,
                    difficulty: 5.0,
                    scheduled_days: 0,
                    learning_steps: 1,
                    time: 10,
                    is_ignored: false,
                },
            },
        )
        .expect("the grade is saved");
    }

    pub fn card_front(&self, card: &str) -> String {
        self.text(&format!(
            r#"SELECT json_extract(content, '$."{FRONT}".text') FROM cards WHERE id = '{card}'"#
        ))
    }

    pub fn reviews(&self, card: &str) -> i64 {
        self.count(&format!("SELECT COUNT(*) FROM reviews WHERE card_id = '{card}'"))
    }

    pub fn cursors(&self) -> (i64, i64) {
        (
            self.count("SELECT cursor_hot FROM sync_state"),
            self.count("SELECT cursor_cold FROM sync_state"),
        )
    }

    pub fn learning_defaults(&self) -> (String, String) {
        let default = |key: &str| {
            self.text(&format!(
                "SELECT json_extract(content, '$.defaults.{key}') FROM settings WHERE name = 'learning'"
            ))
        };
        (default("algorithm"), default("template"))
    }

    pub fn deck(&self, id: &str) -> Option<Deck> {
        decks::get_deck(&self.db, id).expect("deck reads")
    }

    pub fn has_card(&self, id: &str) -> bool {
        cards::get_card(&self.db, id).expect("card reads").is_some()
    }
}
