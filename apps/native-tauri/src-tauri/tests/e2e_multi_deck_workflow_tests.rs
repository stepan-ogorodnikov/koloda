use koloda_native_tauri::domain::algorithms::InsertAlgorithmData;
use koloda_native_tauri::domain::cards::InsertCardData;
use koloda_native_tauri::domain::decks::InsertDeckData;
use koloda_native_tauri::domain::lessons::{GetLessonsParams, LessonFilters};
use koloda_native_tauri::repo::{algorithms, cards, decks, lessons, templates};

mod common;
use common::{card_content, fsrs_content, simple_template, test_db};

#[test]
fn e2e_multi_deck_workflow() {
    let db = test_db();

    let algo1 = algorithms::add_algorithm(
        &db,
        InsertAlgorithmData {
            title: "FSRS 1".to_string(),
            content: fsrs_content(),
        },
    )
    .expect("algo1 should be created");

    let algo2 = algorithms::add_algorithm(
        &db,
        InsertAlgorithmData {
            title: "FSRS 2".to_string(),
            content: fsrs_content(),
        },
    )
    .expect("algo2 should be created");

    let tpl = templates::add_template(&db, simple_template()).expect("template should be created");

    let deck1 = decks::add_deck(
        &db,
        InsertDeckData {
            title: "Deck 1".to_string(),
            algorithm_id: algo1.id,
            template_id: tpl.id,
        },
    )
    .expect("deck1 should be created");

    let deck2 = decks::add_deck(
        &db,
        InsertDeckData {
            title: "Deck 2".to_string(),
            algorithm_id: algo2.id,
            template_id: tpl.id,
        },
    )
    .expect("deck2 should be created");

    cards::add_card(
        &db,
        InsertCardData {
            deck_id: deck1.id,
            template_id: tpl.id,
            content: card_content("q1", "a1"),
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
    .expect("card1 should be created");

    cards::add_card(
        &db,
        InsertCardData {
            deck_id: deck2.id,
            template_id: tpl.id,
            content: card_content("q2", "a2"),
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
    .expect("card2 should be created");

    let all_lessons = lessons::get_lessons(
        &db,
        GetLessonsParams {
            due_at: 1_000_000_000_000,
            filters: None,
        },
    )
    .expect("should get all lessons");

    let total = all_lessons.iter().find(|l| l.id.is_none()).expect("total should exist");
    assert_eq!(total.total, 2, "should have 2 total cards");

    let deck1_lessons = lessons::get_lessons(
        &db,
        GetLessonsParams {
            due_at: 1_000_000_000_000,
            filters: Some(LessonFilters {
                deck_ids: Some(vec![deck1.id]),
            }),
        },
    )
    .expect("should get filtered lessons");

    let deck1_row = deck1_lessons
        .iter()
        .find(|l| l.id == Some(deck1.id))
        .expect("deck1 row should exist");
    assert_eq!(deck1_row.total, 1);
}
