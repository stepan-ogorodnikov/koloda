use koloda_core::app::error::error_codes;
use koloda_core::domain::decks::{InsertDeckData, UpdateDeckData, UpdateDeckValues};
use koloda_core::repo::decks;

mod common;
use common::fixtures::{add_algorithm, add_deck, add_template};
use common::test_db;

#[test]
fn add_deck_rejects_missing_algorithm() {
    let db = test_db();
    let template_id = add_template(&db, "Basic");

    let err = decks::add_deck(
        &db,
        InsertDeckData {
            title: "Deck".to_string(),
            algorithm_id: 999_999,
            template_id,
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
            algorithm_id,
            template_id: 999_999,
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
            id: 999_999,
            values: UpdateDeckValues {
                title: "Renamed".to_string(),
                algorithm_id,
                template_id,
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
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");

    let missing_algorithm = decks::update_deck(
        &db,
        UpdateDeckData {
            id: deck_id,
            values: UpdateDeckValues {
                title: "Renamed".to_string(),
                algorithm_id: 999_999,
                template_id,
            },
        },
    )
    .expect_err("missing algorithm should fail");
    assert_eq!(missing_algorithm.code, error_codes::NOT_FOUND_DECKS_UPDATE_ALGORITHM);

    let missing_template = decks::update_deck(
        &db,
        UpdateDeckData {
            id: deck_id,
            values: UpdateDeckValues {
                title: "Renamed".to_string(),
                algorithm_id,
                template_id: 999_999,
            },
        },
    )
    .expect_err("missing template should fail");
    assert_eq!(missing_template.code, error_codes::NOT_FOUND_DECKS_UPDATE_TEMPLATE);

    let still = decks::get_deck(&db, deck_id)
        .expect("deck query should succeed")
        .expect("deck should remain unchanged");
    assert_eq!(still.title, "Deck");
    assert_eq!(still.algorithm_id, algorithm_id);
    assert_eq!(still.template_id, template_id);
}
