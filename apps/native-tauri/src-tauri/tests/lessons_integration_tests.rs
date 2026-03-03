use koloda_native_tauri::domain::cards::UpdateCardProgress;
use koloda_native_tauri::domain::lessons::{
    GetLessonDataParams, GetLessonsParams, LessonAmounts, LessonFilters, LessonResultData,
};
use koloda_native_tauri::domain::reviews::InsertReviewData;
use koloda_native_tauri::repo::lessons;

mod common;
use common::fixtures::{add_algorithm, add_card, add_deck, add_template, insert_card_row};
use common::test_db;

#[test]
fn submit_lesson_result_updates_card_and_inserts_review() {
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

    let updated = koloda_native_tauri::repo::cards::get_card(&db, card_id)
        .expect("card query should succeed")
        .expect("card should exist");
    assert_eq!(updated.state, 2);
    assert_eq!(updated.reps, 1);
    assert_eq!(updated.due_at, Some(1_900_000_000_000));

    let saved_reviews = koloda_native_tauri::repo::reviews::get_reviews(
        &db,
        koloda_native_tauri::domain::reviews::GetReviewsData { card_id },
    )
    .expect("reviews query should succeed");
    assert_eq!(saved_reviews.len(), 1);
    assert_eq!(saved_reviews[0].card_id, card_id);
    assert_eq!(saved_reviews[0].rating, 3);
}

#[test]
fn submit_lesson_result_rolls_back_when_review_insert_fails() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let card_id = add_card(&db, deck_id, template_id, "question");

    let result = lessons::submit_lesson_result(
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
                card_id: card_id + 9_999,
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
    );

    assert!(
        result.is_err(),
        "foreign key violation should fail insert and rollback transaction"
    );

    let card_after = koloda_native_tauri::repo::cards::get_card(&db, card_id)
        .expect("card query should succeed")
        .expect("card should exist");
    assert_eq!(card_after.state, 0, "card update should be rolled back");
    assert_eq!(card_after.reps, 0, "card update should be rolled back");
    assert_eq!(card_after.due_at, None, "card update should be rolled back");

    let saved_reviews = koloda_native_tauri::repo::reviews::get_reviews(
        &db,
        koloda_native_tauri::domain::reviews::GetReviewsData { card_id },
    )
    .expect("reviews query should succeed");
    assert!(saved_reviews.is_empty(), "review insert should be rolled back");
}

#[test]
fn get_lessons_counts_cards_per_deck_and_total_row() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_1 = add_deck(&db, algorithm_id, template_id, "Deck 1");
    let deck_2 = add_deck(&db, algorithm_id, template_id, "Deck 2");

    let due_at = 1_000;

    let _ = insert_card_row(&db, deck_1, template_id, 0, None, 10);
    let _ = insert_card_row(&db, deck_1, template_id, 1, Some(900), 20);
    let _ = insert_card_row(&db, deck_1, template_id, 1, Some(1_100), 30);
    let _ = insert_card_row(&db, deck_1, template_id, 2, Some(800), 40);
    let _ = insert_card_row(&db, deck_1, template_id, 2, Some(1_200), 50);
    let _ = insert_card_row(&db, deck_1, template_id, 3, Some(700), 60);
    let _ = insert_card_row(&db, deck_2, template_id, 0, None, 70);

    let lessons_all =
        lessons::get_lessons(&db, GetLessonsParams { due_at, filters: None }).expect("lessons query should succeed");

    let deck_1_row = lessons_all
        .iter()
        .find(|row| row.id == Some(deck_1))
        .expect("deck 1 row should exist");
    assert_eq!(deck_1_row.untouched, 1);
    assert_eq!(deck_1_row.learn, 2);
    assert_eq!(deck_1_row.review, 1);
    assert_eq!(deck_1_row.total, 4);

    let deck_2_row = lessons_all
        .iter()
        .find(|row| row.id == Some(deck_2))
        .expect("deck 2 row should exist");
    assert_eq!(deck_2_row.untouched, 1);
    assert_eq!(deck_2_row.learn, 0);
    assert_eq!(deck_2_row.review, 0);
    assert_eq!(deck_2_row.total, 1);

    let total_row = lessons_all
        .iter()
        .find(|row| row.id.is_none())
        .expect("summary row should exist");
    assert_eq!(total_row.untouched, 2);
    assert_eq!(total_row.learn, 2);
    assert_eq!(total_row.review, 1);
    assert_eq!(total_row.total, 5);

    let lessons_filtered = lessons::get_lessons(
        &db,
        GetLessonsParams {
            due_at,
            filters: Some(LessonFilters {
                deck_ids: Some(vec![deck_1]),
            }),
        },
    )
    .expect("filtered lessons query should succeed");

    let filtered_deck_1 = lessons_filtered
        .iter()
        .find(|row| row.id == Some(deck_1))
        .expect("filtered deck 1 row should exist");
    assert_eq!(filtered_deck_1.total, 4);

    let filtered_deck_2 = lessons_filtered
        .iter()
        .find(|row| row.id == Some(deck_2))
        .expect("deck 2 row still exists under current query behavior");
    assert_eq!(filtered_deck_2.total, 0);

    let filtered_total = lessons_filtered
        .iter()
        .find(|row| row.id.is_none())
        .expect("filtered summary row should exist");
    assert_eq!(filtered_total.total, 4);
}

#[test]
fn get_lesson_cards_applies_limits_due_at_and_deck_filters() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_1 = add_deck(&db, algorithm_id, template_id, "Deck 1");
    let deck_2 = add_deck(&db, algorithm_id, template_id, "Deck 2");

    let due_at = 1_000;

    let untouched_first = insert_card_row(&db, deck_1, template_id, 0, None, 10);
    let _untouched_second = insert_card_row(&db, deck_1, template_id, 0, None, 20);
    let learn_earliest_due = insert_card_row(&db, deck_1, template_id, 1, Some(800), 30);
    let _learn_later_due = insert_card_row(&db, deck_1, template_id, 1, Some(900), 40);
    let _learn_not_due = insert_card_row(&db, deck_1, template_id, 1, Some(1_100), 50);
    let review_earliest_due = insert_card_row(&db, deck_1, template_id, 2, Some(700), 60);
    let _review_not_due = insert_card_row(&db, deck_1, template_id, 2, Some(1_200), 70);

    let _foreign_deck_untouched = insert_card_row(&db, deck_2, template_id, 0, None, 80);
    let _foreign_deck_learn = insert_card_row(&db, deck_2, template_id, 1, Some(600), 90);
    let _foreign_deck_review = insert_card_row(&db, deck_2, template_id, 2, Some(500), 100);

    let cards_result = lessons::get_lesson_cards(
        &db,
        &GetLessonDataParams {
            due_at,
            filters: LessonFilters {
                deck_ids: Some(vec![deck_1]),
            },
            amounts: LessonAmounts {
                untouched: 1,
                learn: 1,
                review: 1,
                total: 3,
            },
        },
    )
    .expect("lesson cards query should succeed");

    assert_eq!(cards_result.len(), 3);
    assert_eq!(cards_result[0].id, untouched_first);
    assert_eq!(cards_result[1].id, learn_earliest_due);
    assert_eq!(cards_result[2].id, review_earliest_due);
    assert!(cards_result.iter().all(|card| card.deck_id == deck_1));
}

#[test]
fn get_lesson_data_returns_none_when_no_cards_match_requested_amounts() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let _ = add_card(&db, deck_id, template_id, "question");

    let no_cards = lessons::get_lesson_data(
        &db,
        &GetLessonDataParams {
            due_at: 1_000,
            filters: LessonFilters {
                deck_ids: Some(vec![deck_id]),
            },
            amounts: LessonAmounts {
                untouched: 0,
                learn: 0,
                review: 0,
                total: 0,
            },
        },
    )
    .expect("lesson data query should succeed");

    assert!(no_cards.is_none());
}

#[test]
fn get_lesson_data_returns_related_decks_templates_and_algorithms() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let card_id = add_card(&db, deck_id, template_id, "question");

    let lesson_data = lessons::get_lesson_data(
        &db,
        &GetLessonDataParams {
            due_at: 1_000,
            filters: LessonFilters {
                deck_ids: Some(vec![deck_id]),
            },
            amounts: LessonAmounts {
                untouched: 1,
                learn: 0,
                review: 0,
                total: 1,
            },
        },
    )
    .expect("lesson data query should succeed")
    .expect("lesson data should exist");

    assert_eq!(lesson_data.cards.len(), 1);
    assert_eq!(lesson_data.cards[0].id, card_id);
    assert_eq!(lesson_data.decks.len(), 1);
    assert_eq!(lesson_data.decks[0].id, deck_id);
    assert_eq!(lesson_data.templates.len(), 1);
    assert_eq!(lesson_data.templates[0].id, template_id);
    assert_eq!(lesson_data.algorithms.len(), 1);
    assert_eq!(lesson_data.algorithms[0].id, algorithm_id);
}

#[test]
fn get_lessons_with_empty_deck_filter_matches_unfiltered_results() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_1 = add_deck(&db, algorithm_id, template_id, "Deck 1");
    let deck_2 = add_deck(&db, algorithm_id, template_id, "Deck 2");

    let _ = insert_card_row(&db, deck_1, template_id, 0, None, 10);
    let _ = insert_card_row(&db, deck_2, template_id, 2, Some(500), 20);

    let due_at = 1_000;

    let unfiltered = lessons::get_lessons(&db, GetLessonsParams { due_at, filters: None })
        .expect("unfiltered lessons query should succeed");

    let empty_filter = lessons::get_lessons(
        &db,
        GetLessonsParams {
            due_at,
            filters: Some(LessonFilters { deck_ids: Some(vec![]) }),
        },
    )
    .expect("empty-filter lessons query should succeed");

    assert_eq!(unfiltered.len(), empty_filter.len());
    assert_eq!(unfiltered[0].total, empty_filter[0].total);
    assert_eq!(unfiltered[1].total, empty_filter[1].total);
    assert_eq!(unfiltered[2].total, empty_filter[2].total);
}

#[test]
fn get_lesson_cards_treats_state_three_as_learn() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");

    let learn_state_three_due = insert_card_row(&db, deck_id, template_id, 3, Some(900), 10);
    let _learn_state_three_not_due = insert_card_row(&db, deck_id, template_id, 3, Some(1_100), 20);

    let cards_result = lessons::get_lesson_cards(
        &db,
        &GetLessonDataParams {
            due_at: 1_000,
            filters: LessonFilters {
                deck_ids: Some(vec![deck_id]),
            },
            amounts: LessonAmounts {
                untouched: 0,
                learn: 1,
                review: 0,
                total: 1,
            },
        },
    )
    .expect("lesson cards query should succeed");

    assert_eq!(cards_result.len(), 1);
    assert_eq!(cards_result[0].id, learn_state_three_due);
    assert_eq!(cards_result[0].state, 3);
}

#[test]
fn get_lesson_data_includes_unique_related_entities_for_multiple_decks() {
    let db = test_db();
    let algorithm_1 = add_algorithm(&db, "FSRS 1");
    let algorithm_2 = add_algorithm(&db, "FSRS 2");
    let template_1 = add_template(&db, "Basic 1");
    let template_2 = add_template(&db, "Basic 2");

    let deck_1 = add_deck(&db, algorithm_1, template_1, "Deck 1");
    let deck_2 = add_deck(&db, algorithm_2, template_2, "Deck 2");
    let _ = add_card(&db, deck_1, template_1, "q1");
    let _ = add_card(&db, deck_2, template_2, "q2");

    let lesson_data = lessons::get_lesson_data(
        &db,
        &GetLessonDataParams {
            due_at: 1_000,
            filters: LessonFilters {
                deck_ids: Some(vec![deck_1, deck_2]),
            },
            amounts: LessonAmounts {
                untouched: 2,
                learn: 0,
                review: 0,
                total: 2,
            },
        },
    )
    .expect("lesson data query should succeed")
    .expect("lesson data should exist");

    assert_eq!(lesson_data.cards.len(), 2);
    assert_eq!(lesson_data.decks.len(), 2);
    assert_eq!(lesson_data.templates.len(), 2);
    assert_eq!(lesson_data.algorithms.len(), 2);
}
