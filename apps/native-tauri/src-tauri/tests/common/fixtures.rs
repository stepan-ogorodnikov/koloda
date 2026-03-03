#![allow(dead_code)]

use koloda_native_tauri::app::db::Database;
use koloda_native_tauri::domain::algorithms::InsertAlgorithmData;
use koloda_native_tauri::domain::cards::InsertCardData;
use koloda_native_tauri::domain::decks::InsertDeckData;
use koloda_native_tauri::domain::templates::InsertTemplateData;
use koloda_native_tauri::repo::{algorithms, cards, decks, templates};

use crate::common::{card_content, fsrs_algorithm_content, simple_template_content};

pub fn add_algorithm(db: &Database, title: &str) -> i64 {
    let algorithm = algorithms::add_algorithm(
        db,
        InsertAlgorithmData {
            title: title.to_string(),
            content: fsrs_algorithm_content(),
        },
    )
    .expect("algorithm should be created");

    algorithm.id
}

pub fn add_template(db: &Database, title: &str) -> i64 {
    let template = templates::add_template(
        db,
        InsertTemplateData {
            title: title.to_string(),
            content: simple_template_content(),
        },
    )
    .expect("template should be created");

    template.id
}

pub fn add_deck(db: &Database, algorithm_id: i64, template_id: i64, title: &str) -> i64 {
    let deck = decks::add_deck(
        db,
        InsertDeckData {
            title: title.to_string(),
            algorithm_id,
            template_id,
        },
    )
    .expect("deck should be created");

    deck.id
}

pub fn add_card(db: &Database, deck_id: i64, template_id: i64, front: &str) -> i64 {
    let card = cards::add_card(
        db,
        InsertCardData {
            deck_id,
            template_id,
            content: card_content(front, "answer"),
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
    .expect("card should be created");

    card.id
}

pub fn insert_card_row(
    db: &Database,
    deck_id: i64,
    template_id: i64,
    state: i32,
    due_at: Option<i64>,
    created_at: i64,
) -> i64 {
    let content = serde_json::to_string(&card_content("q", "a")).expect("content should serialize");
    db.with_conn(|conn| {
        conn.execute(
            r#"
            INSERT INTO cards (deck_id, template_id, content, state, due_at, stability, difficulty,
                              scheduled_days, learning_steps, reps, lapses, last_reviewed_at, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, 0, 0, 0, NULL, ?6, NULL)
            "#,
            rusqlite::params![deck_id, template_id, content, state, due_at, created_at],
        )?;
        Ok(conn.last_insert_rowid())
    })
    .expect("card row should insert")
}

pub fn insert_review_row(db: &Database, card_id: i64, state: i32, is_ignored: i32, created_at: i64) {
    db.with_conn(|conn| {
        conn.execute(
            r#"
            INSERT INTO reviews (card_id, rating, state, due_at, stability, difficulty,
                                scheduled_days, learning_steps, time, is_ignored, created_at)
            VALUES (?1, 3, ?2, NULL, 1.0, 5.0, 0, 0, 10, ?3, ?4)
            "#,
            rusqlite::params![card_id, state, is_ignored, created_at],
        )?;
        Ok(())
    })
    .expect("review row should insert");
}
