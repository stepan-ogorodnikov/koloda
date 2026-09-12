use koloda::app::error::error_codes;
use koloda::domain::decks::{DeleteDeckData, InsertDeckData, UpdateDeckData, UpdateDeckValues};
use koloda::domain::reviews::GetReviewsData;
use koloda::repo::{cards, decks, reviews};

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template, insert_review_row};
use crate::common::test_db;

#[test]
fn add_deck_rejects_missing_algorithm() {
    let db = test_db();
    let template_id = add_template(&db, "Basic");

    let err = decks::add_deck(
        &db,
        InsertDeckData {
            title: "Deck".to_string(),
            algorithm_id: "01900000-0000-7000-8000-0000000f423f".to_string(),
            template_id: template_id.clone(),
        },
    )
    .expect_err("missing algorithm should fail");

    assert_eq!(err.code, error_codes::NOT_FOUND_DECKS_ADD_ALGORITHM);
}

#[test]
fn add_deck_rejects_missing_template() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");

    let err = decks::add_deck(
        &db,
        InsertDeckData {
            title: "Deck".to_string(),
            algorithm_id: algorithm_id.clone(),
            template_id: "01900000-0000-7000-8000-0000000f423f".to_string(),
        },
    )
    .expect_err("missing template should fail");

    assert_eq!(err.code, error_codes::NOT_FOUND_DECKS_ADD_TEMPLATE);
}

#[test]
fn update_deck_rejects_missing_deck() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");

    let err = decks::update_deck(
        &db,
        UpdateDeckData {
            id: "01900000-0000-7000-8000-0000000f423f".to_string(),
            values: UpdateDeckValues {
                title: "Renamed".to_string(),
                algorithm_id: algorithm_id.clone(),
                template_id: template_id.clone(),
            },
        },
    )
    .expect_err("missing deck should fail");

    assert_eq!(err.code, error_codes::NOT_FOUND_DECKS_UPDATE_DECK);
}

#[test]
fn update_deck_rejects_missing_algorithm_and_template() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, &algorithm_id, &template_id, "Deck");

    let missing_algorithm = decks::update_deck(
        &db,
        UpdateDeckData {
            id: deck_id.clone(),
            values: UpdateDeckValues {
                title: "Renamed".to_string(),
                algorithm_id: "01900000-0000-7000-8000-0000000f423f".to_string(),
                template_id: template_id.clone(),
            },
        },
    )
    .expect_err("missing algorithm should fail");
    assert_eq!(missing_algorithm.code, error_codes::NOT_FOUND_DECKS_UPDATE_ALGORITHM);

    let missing_template = decks::update_deck(
        &db,
        UpdateDeckData {
            id: deck_id.clone(),
            values: UpdateDeckValues {
                title: "Renamed".to_string(),
                algorithm_id: algorithm_id.clone(),
                template_id: "01900000-0000-7000-8000-0000000f423f".to_string(),
            },
        },
    )
    .expect_err("missing template should fail");
    assert_eq!(missing_template.code, error_codes::NOT_FOUND_DECKS_UPDATE_TEMPLATE);

    let still = decks::get_deck(&db, &deck_id)
        .expect("deck query should succeed")
        .expect("deck should remain unchanged");
    assert_eq!(still.title, "Deck");
    assert_eq!(still.algorithm_id, algorithm_id);
    assert_eq!(still.template_id, template_id);
}

#[test]
fn delete_deck_removes_deck_and_cascades_cards_and_reviews() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, &algorithm_id, &template_id, "Deck");
    let other_deck_id = add_deck(&db, &algorithm_id, &template_id, "Other deck");
    let card_id = add_card(&db, &deck_id, &template_id, "question");
    let other_card_id = add_card(&db, &other_deck_id, &template_id, "untouched");

    insert_review_row(&db, &card_id, 2, 0, 1_800_000_000_000);

    decks::delete_deck(&db, DeleteDeckData { id: deck_id.clone() }).expect("delete should succeed");

    let deleted_deck = decks::get_deck(&db, &deck_id).expect("deck lookup should succeed");
    assert!(deleted_deck.is_none(), "deleted deck should no longer exist");

    let remaining_cards = cards::get_cards(&db, &deck_id).expect("cards query should succeed");
    assert!(
        remaining_cards.is_empty(),
        "deleting a deck should cascade to its cards"
    );

    let saved_reviews = reviews::get_reviews(
        &db,
        GetReviewsData {
            card_id: card_id.clone(),
        },
    )
    .expect("reviews query should succeed");
    assert!(
        saved_reviews.is_empty(),
        "deleting a deck should cascade to its cards' reviews"
    );

    let untouched_deck = decks::get_deck(&db, &other_deck_id)
        .expect("deck query should succeed")
        .expect("other decks should be unaffected");
    assert_eq!(untouched_deck.title, "Other deck");

    let untouched_cards = cards::get_cards(&db, &other_deck_id).expect("cards query should succeed");
    assert_eq!(
        untouched_cards.iter().map(|card| card.id.as_str()).collect::<Vec<_>>(),
        vec![other_card_id.as_str()],
        "other decks should keep their cards"
    );
}
