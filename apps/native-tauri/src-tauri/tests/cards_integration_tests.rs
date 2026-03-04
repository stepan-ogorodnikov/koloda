use koloda_native_tauri::domain::cards::{InsertCardData, ResetCardProgressData, UpdateCardProgress};
use koloda_native_tauri::domain::lessons::LessonResultData;
use koloda_native_tauri::domain::reviews::{GetReviewsData, InsertReviewData};
use koloda_native_tauri::repo::{cards, lessons, reviews};

mod common;
use common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use common::test_db;

#[test]
fn add_cards_keeps_previously_inserted_cards_on_failure() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");

    let result = cards::add_cards(
        &db,
        vec![
            InsertCardData {
                deck_id,
                template_id,
                content: common::card_content("first", "answer"),
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
            InsertCardData {
                deck_id,
                template_id: 999_999,
                content: common::card_content("second", "answer"),
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
        ],
    );

    assert!(result.is_ok());
    let results = result.unwrap();
    assert_eq!(results.len(), 2);

    assert!(results[0].error.is_none(), "first card should succeed");
    assert!(results[1].error.is_some(), "second card should fail");

    let cards_after = cards::get_cards(&db, deck_id).expect("cards query should succeed");
    assert_eq!(
        cards_after.len(),
        1,
        "first insert remains even though second insert failed"
    );
    assert_eq!(cards_after[0].content.get("1").map(|v| v.text.as_str()), Some("first"));
}

#[test]
fn reset_card_progress_removes_reviews_and_resets_progress_fields() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let card_id = add_card(&db, deck_id, template_id, "question");

    lessons::submit_lesson_result(
        &db,
        LessonResultData {
            card: UpdateCardProgress {
                id: card_id,
                state: 2,
                due_at: 1_900_000_000_000,
                stability: 5.0,
                difficulty: 5.0,
                scheduled_days: 3,
                learning_steps: 0,
                reps: 1,
                lapses: 0,
                last_reviewed_at: Some(1_800_000_000_000),
            },
            review: InsertReviewData {
                card_id,
                rating: 3,
                state: 2,
                due_at: Some(1_900_000_000_000),
                stability: 5.0,
                difficulty: 5.0,
                scheduled_days: 3,
                learning_steps: 0,
                time: 12,
                is_ignored: false,
            },
        },
    )
    .expect("lesson result should be persisted");

    let reset = cards::reset_card_progress(&db, ResetCardProgressData { id: card_id }).expect("reset should succeed");

    assert_eq!(reset.state, 0);
    assert_eq!(reset.reps, 0);
    assert_eq!(reset.lapses, 0);
    assert_eq!(reset.scheduled_days, 0);
    assert_eq!(reset.learning_steps, 0);
    assert_eq!(reset.due_at, None);
    assert_eq!(reset.last_reviewed_at, None);

    let saved_reviews = reviews::get_reviews(&db, GetReviewsData { card_id }).expect("reviews query should succeed");
    assert!(saved_reviews.is_empty(), "reset should delete prior reviews");
}
