use koloda_native_tauri::domain::algorithms::InsertAlgorithmData;
use koloda_native_tauri::domain::cards::InsertCardData;
use koloda_native_tauri::domain::decks::InsertDeckData;
use koloda_native_tauri::domain::lessons::{
    GetLessonDataParams, GetLessonsParams, LessonAmounts, LessonFilters, LessonResultData,
};
use koloda_native_tauri::domain::reviews::GetReviewTotalsParams;
use koloda_native_tauri::repo::{algorithms, cards, decks, lessons, reviews, templates};

mod common;
use common::{card_content, fsrs_content, test_db};

#[test]
fn e2e_full_learning_workflow() {
    let db = test_db();

    let algorithm = algorithms::add_algorithm(
        &db,
        InsertAlgorithmData {
            title: "FSRS".to_string(),
            content: fsrs_content(),
        },
    )
    .expect("algorithm should be created");
    let algorithm_id = algorithm.id;

    let template = templates::add_template(&db, common::simple_template()).expect("template should be created");
    let template_id = template.id;

    let deck = decks::add_deck(
        &db,
        InsertDeckData {
            title: "Test Deck".to_string(),
            algorithm_id,
            template_id,
        },
    )
    .expect("deck should be created");
    let deck_id = deck.id;

    for i in 0..5 {
        cards::add_card(
            &db,
            InsertCardData {
                deck_id,
                template_id,
                content: card_content(&format!("Question {}", i), &format!("Answer {}", i)),
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
    }

    let lessons = lessons::get_lessons(
        &db,
        GetLessonsParams {
            due_at: 1_000_000_000_000,
            filters: None,
        },
    )
    .expect("should get lessons");
    let total_row = lessons.iter().find(|l| l.id.is_none()).expect("total row should exist");
    assert_eq!(total_row.total, 5, "should have 5 cards to review");

    let lesson_data = lessons::get_lesson_data(
        &db,
        &GetLessonDataParams {
            due_at: 1_000_000_000_000,
            filters: LessonFilters {
                deck_ids: Some(vec![deck_id]),
            },
            amounts: LessonAmounts {
                untouched: 5,
                learn: 0,
                review: 0,
                total: 5,
            },
        },
    )
    .expect("should get lesson data")
    .expect("lesson data should exist");

    assert_eq!(lesson_data.cards.len(), 5);
    assert_eq!(lesson_data.decks.len(), 1);
    assert_eq!(lesson_data.decks[0].id, deck_id);

    for card in &lesson_data.cards {
        lessons::submit_lesson_result(
            &db,
            LessonResultData {
                card: koloda_native_tauri::domain::cards::UpdateCardProgress {
                    id: card.id,
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
                review: koloda_native_tauri::domain::reviews::InsertReviewData {
                    card_id: card.id,
                    rating: 3,
                    state: 2,
                    due_at: Some(1_900_000_000_000),
                    stability: 5.0,
                    difficulty: 5.0,
                    scheduled_days: 3,
                    learning_steps: 0,
                    time: 10,
                    is_ignored: false,
                },
            },
        )
        .expect("lesson result should be submitted");
    }

    let totals = reviews::get_review_totals(
        &db,
        GetReviewTotalsParams {
            from: 0,
            to: 2_000_000_000_000,
        },
    )
    .expect("should get review totals");
    assert_eq!(totals.review, 5, "should have 5 reviews");

    let lessons_after = lessons::get_lessons(
        &db,
        GetLessonsParams {
            due_at: 1_000_000_000_000,
            filters: None,
        },
    )
    .expect("should get lessons after");
    let total_after = lessons_after
        .iter()
        .find(|l| l.id.is_none())
        .expect("total row should exist");
    assert_eq!(total_after.total, 0, "no cards should be due");
}
