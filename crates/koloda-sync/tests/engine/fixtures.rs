//! Product rows written through `koloda`'s repo functions, so capture records them as the app would.

use std::collections::HashMap;

use koloda::domain::algorithms::InsertAlgorithmData;
use koloda::domain::cards::{CardContentField, InsertCardData};
use koloda::domain::decks::{Deck, InsertDeckData, UpdateDeckData, UpdateDeckValues};
use koloda::domain::templates::{
    InsertTemplateData, TemplateContent, TemplateField, TemplateLayoutItem, UpdateTemplateData, UpdateTemplateValues,
};
use koloda::repo::sync::repair::Starter;
use koloda::repo::{algorithms, cards, decks, templates};
use serde_json::json;

use crate::common::Device;

const FRONT: &str = "01900000-0000-7000-8000-000000000001";
const BACK: &str = "01900000-0000-7000-8000-000000000002";

/// An algorithm, a template, a deck on both, and one card.
pub struct Library {
    pub algorithm: String,
    pub template: String,
    pub deck: String,
    pub card: String,
}

pub fn starter() -> Starter {
    Starter {
        algorithm: algorithm_data("Starter"),
        template: template_data("Starter"),
    }
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

    pub fn deck(&self, id: &str) -> Option<Deck> {
        decks::get_deck(&self.db, id).expect("deck reads")
    }

    pub fn has_card(&self, id: &str) -> bool {
        cards::get_card(&self.db, id).expect("card reads").is_some()
    }
}
