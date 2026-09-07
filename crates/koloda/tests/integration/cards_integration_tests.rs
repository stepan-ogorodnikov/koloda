use koloda::app::error::error_codes;
use koloda::domain::cards::{
    DeleteCardData, DeleteCardsData, InsertCardData, ResetCardProgressData, UpdateCardProgress,
};
use koloda::domain::lessons::LessonResultData;
use koloda::domain::reviews::{GetReviewsData, InsertReviewData};
use koloda::repo::{cards, lessons, reviews};

use crate::common::card_content;
use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template, insert_review_row};
use crate::common::test_db;

#[test]
fn get_card_counts_groups_by_deck() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_a = add_deck(&db, algorithm_id, template_id, "Deck A");
    let deck_b = add_deck(&db, algorithm_id, template_id, "Deck B");

    add_card(&db, deck_a, template_id, "front one");
    add_card(&db, deck_a, template_id, "front two");
    add_card(&db, deck_b, template_id, "front three");

    let counts = cards::get_card_counts(&db).unwrap();

    let count_a = counts.iter().find(|c| c.deck_id == deck_a).map(|c| c.count);
    let count_b = counts.iter().find(|c| c.deck_id == deck_b).map(|c| c.count);
    assert_eq!(count_a, Some(2));
    assert_eq!(count_b, Some(1));
    // Decks without cards simply have no entry.
    assert!(counts.iter().all(|c| c.deck_id != 999_999));
}

#[test]
fn add_card_rejects_missing_deck() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let _deck_id = add_deck(&db, algorithm_id, template_id, "Deck");

    let result = cards::add_card(
        &db,
        InsertCardData {
            deck_id: 999_999,
            template_id,
            content: card_content("question", "answer"),
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
    );

    assert_eq!(result.unwrap_err().code, error_codes::NOT_FOUND_CARDS_ADD_DECK);
}

#[test]
fn add_card_rejects_invalid_progress_state() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");

    let result = cards::add_card(
        &db,
        InsertCardData {
            deck_id,
            template_id,
            content: card_content("question", "answer"),
            state: Some(999),
            due_at: None,
            stability: None,
            difficulty: None,
            scheduled_days: None,
            learning_steps: None,
            reps: None,
            lapses: None,
            last_reviewed_at: None,
        },
    );

    assert_eq!(result.unwrap_err().code, error_codes::VALIDATION_CARDS_PROGRESS_STATE);
}

#[test]
fn add_cards_rejects_missing_deck_per_item() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");

    let result = cards::add_cards(
        &db,
        vec![InsertCardData {
            deck_id: 999_999,
            template_id,
            content: card_content("question", "answer"),
            state: None,
            due_at: None,
            stability: None,
            difficulty: None,
            scheduled_days: None,
            learning_steps: None,
            reps: None,
            lapses: None,
            last_reviewed_at: None,
        }],
    )
    .expect("batch add should return per-item results");

    assert_eq!(result.len(), 1);
    assert_eq!(
        result[0].error.as_ref().map(|e| e.code.as_str()),
        Some(error_codes::NOT_FOUND_CARDS_ADD_DECK)
    );

    let cards_after = cards::get_cards(&db, deck_id).expect("cards query should succeed");
    assert!(cards_after.is_empty(), "no card should be inserted for a missing deck");
}

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
                content: card_content("first", "answer"),
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
                content: card_content("second", "answer"),
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

    let results = result.unwrap();
    assert_eq!(results.len(), 2);

    assert!(results[0].error.is_none(), "first card should succeed");
    assert!(results[1].error.is_some(), "second card should fail");
    assert_eq!(
        results[1].error.as_ref().map(|e| e.code.as_str()),
        Some(error_codes::NOT_FOUND_CARDS_ADD_TEMPLATE),
        "failure item must keep the structured error code"
    );

    let cards_after = cards::get_cards(&db, deck_id).expect("cards query should succeed");
    assert_eq!(
        cards_after.len(),
        1,
        "first insert remains even though second insert failed"
    );
    assert_eq!(cards_after[0].content.get("1").map(|v| v.text.as_str()), Some("first"));
}

#[test]
fn add_cards_supports_mixed_templates_in_one_batch() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id_a = add_template(&db, "Basic");
    let template_id_b = add_template(&db, "Cloze");
    let deck_id_a = add_deck(&db, algorithm_id, template_id_a, "Deck A");
    let deck_id_b = add_deck(&db, algorithm_id, template_id_b, "Deck B");

    let result = cards::add_cards(
        &db,
        vec![
            InsertCardData {
                deck_id: deck_id_a,
                template_id: template_id_a,
                content: card_content("first", "answer"),
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
                deck_id: deck_id_b,
                template_id: template_id_b,
                content: card_content("second", "answer"),
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

    let results = result.unwrap();
    assert_eq!(results.len(), 2);
    assert!(results[0].error.is_none(), "first card (template A) should succeed");
    assert!(results[1].error.is_none(), "second card (template B) should succeed");

    let cards_a = cards::get_cards(&db, deck_id_a).expect("cards query should succeed");
    let cards_b = cards::get_cards(&db, deck_id_b).expect("cards query should succeed");
    assert_eq!(cards_a.len(), 1);
    assert_eq!(cards_b.len(), 1);
    assert_eq!(cards_a[0].template_id, template_id_a);
    assert_eq!(cards_b[0].template_id, template_id_b);
}

#[test]
fn add_card_omitted_stability_and_difficulty_persists_zero() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");

    let added = cards::add_card(
        &db,
        InsertCardData {
            deck_id,
            template_id,
            content: card_content("question", "answer"),
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

    assert!(
        added.stability.abs() < f64::EPSILON,
        "omitted stability should persist as 0, got {}",
        added.stability
    );
    assert!(
        added.difficulty.abs() < f64::EPSILON,
        "omitted difficulty should persist as 0, got {}",
        added.difficulty
    );

    let fetched = cards::get_card(&db, added.id)
        .expect("card lookup should succeed")
        .expect("card should exist");
    assert!(
        fetched.stability.abs() < f64::EPSILON,
        "stored stability should be 0, got {}",
        fetched.stability
    );
    assert!(
        fetched.difficulty.abs() < f64::EPSILON,
        "stored difficulty should be 0, got {}",
        fetched.difficulty
    );

    // Pin stored SQL is 0, not NULL — get_card_row also coerces legacy NULL to 0.
    db.with_conn(|conn| {
        let (stability, difficulty): (Option<f64>, Option<f64>) = conn.query_row(
            "SELECT stability, difficulty FROM cards WHERE id = ?1",
            rusqlite::params![added.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        assert_eq!(stability, Some(0.0));
        assert_eq!(difficulty, Some(0.0));
        Ok(())
    })
    .expect("stored columns should be 0, not NULL");
}

#[test]
fn get_card_reads_null_stability_and_difficulty_as_zero() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let content = serde_json::to_string(&card_content("q", "a")).expect("content should serialize");

    let card_id = db
        .with_conn(|conn| {
            conn.execute(
                r#"
                INSERT INTO cards (deck_id, template_id, content, state, due_at, stability, difficulty,
                                  scheduled_days, learning_steps, reps, lapses, last_reviewed_at, created_at, updated_at)
                VALUES (?1, ?2, ?3, 0, NULL, NULL, NULL, 0, 0, 0, 0, NULL, 1700000000000, NULL)
                "#,
                rusqlite::params![deck_id, template_id, content],
            )?;
            Ok(conn.last_insert_rowid())
        })
        .expect("legacy NULL row should insert");

    let fetched = cards::get_card(&db, card_id)
        .expect("card lookup should succeed")
        .expect("card should exist");
    assert!(
        fetched.stability.abs() < f64::EPSILON,
        "legacy NULL stability should read as 0, got {}",
        fetched.stability
    );
    assert!(
        fetched.difficulty.abs() < f64::EPSILON,
        "legacy NULL difficulty should read as 0, got {}",
        fetched.difficulty
    );

    let listed = cards::get_cards(&db, deck_id).expect("cards query should succeed");
    assert_eq!(listed.len(), 1);
    assert!(
        listed[0].stability.abs() < f64::EPSILON,
        "listed legacy NULL stability should read as 0, got {}",
        listed[0].stability
    );
    assert!(
        listed[0].difficulty.abs() < f64::EPSILON,
        "listed legacy NULL difficulty should read as 0, got {}",
        listed[0].difficulty
    );
}

#[test]
fn reset_card_progress_fails_with_not_found_when_card_is_missing() {
    let db = test_db();

    let err = cards::reset_card_progress(&db, ResetCardProgressData { id: 999_999 })
        .expect_err("resetting progress for a missing card should fail");

    assert_eq!(err.code, error_codes::NOT_FOUND_CARDS_RESET_CARD);
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
    assert!(
        reset.stability.abs() < f64::EPSILON,
        "reset stability should be 0, got {}",
        reset.stability
    );
    assert!(
        reset.difficulty.abs() < f64::EPSILON,
        "reset difficulty should be 0, got {}",
        reset.difficulty
    );
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
