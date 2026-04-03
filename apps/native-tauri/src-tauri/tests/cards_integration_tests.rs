use koloda_native_tauri::domain::cards::{
    DeleteCardData, DeleteCardsData, InsertCardData, ResetCardProgressData, UpdateCardProgress,
};
use koloda_native_tauri::domain::lessons::LessonResultData;
use koloda_native_tauri::domain::reviews::{GetReviewsData, InsertReviewData};
use koloda_native_tauri::repo::{cards, lessons, reviews};

mod common;
use common::fixtures::{add_algorithm, add_card, add_deck, add_template, insert_review_row};
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

#[test]
fn delete_card_removes_card_and_cascades_reviews() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let card_id = add_card(&db, deck_id, template_id, "question");

    insert_review_row(&db, card_id, 2, 0, 1_800_000_000_000);

    cards::delete_card(&db, DeleteCardData { id: card_id }).expect("delete should succeed");

    let deleted_card = cards::get_card(&db, card_id).expect("card lookup should succeed");
    assert!(deleted_card.is_none(), "deleted card should no longer exist");

    let remaining_cards = cards::get_cards(&db, deck_id).expect("cards query should succeed");
    assert!(
        remaining_cards.is_empty(),
        "deleted card should be removed from the deck"
    );

    let saved_reviews = reviews::get_reviews(&db, GetReviewsData { card_id }).expect("reviews query should succeed");
    assert!(
        saved_reviews.is_empty(),
        "deleting a card should cascade to its reviews"
    );
}

#[test]
fn delete_cards_removes_only_selected_cards() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let first_card_id = add_card(&db, deck_id, template_id, "first");
    let second_card_id = add_card(&db, deck_id, template_id, "second");
    let third_card_id = add_card(&db, deck_id, template_id, "third");

    cards::delete_cards(
        &db,
        DeleteCardsData {
            ids: vec![first_card_id, third_card_id],
        },
    )
    .expect("batch delete should succeed");

    let remaining_cards = cards::get_cards(&db, deck_id).expect("cards query should succeed");
    assert_eq!(remaining_cards.len(), 1);
    assert_eq!(remaining_cards[0].id, second_card_id);
    assert_eq!(
        remaining_cards[0].content.get("1").map(|value| value.text.as_str()),
        Some("second")
    );
}

#[test]
fn delete_cards_with_empty_ids_is_a_noop() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let card_id = add_card(&db, deck_id, template_id, "question");

    cards::delete_cards(&db, DeleteCardsData { ids: vec![] }).expect("empty batch delete should succeed");

    let saved_card = cards::get_card(&db, card_id).expect("card lookup should succeed");
    assert!(saved_card.is_some(), "empty batch delete should not remove cards");
}
