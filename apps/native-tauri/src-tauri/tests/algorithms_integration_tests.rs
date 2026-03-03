use koloda_native_tauri::app::error::error_codes;
use koloda_native_tauri::domain::algorithms::DeleteAlgorithmData;
use koloda_native_tauri::repo::algorithms;

mod common;
use common::fixtures::{add_algorithm, add_deck, add_template};
use common::test_db;

#[test]
fn delete_algorithm_reassigns_decks_to_successor() {
    let db = test_db();
    let old_algorithm_id = add_algorithm(&db, "Old FSRS");
    let successor_algorithm_id = add_algorithm(&db, "New FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, old_algorithm_id, template_id, "Deck");

    algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: old_algorithm_id,
            successor_id: Some(successor_algorithm_id),
        },
    )
    .expect("algorithm delete with successor should succeed");

    let deck = koloda_native_tauri::repo::decks::get_deck(&db, deck_id)
        .expect("deck query should succeed")
        .expect("deck should exist");
    assert_eq!(deck.algorithm_id, successor_algorithm_id);

    let deleted_algorithm = algorithms::get_algorithm(&db, old_algorithm_id).expect("query should succeed");
    assert!(deleted_algorithm.is_none());
}

#[test]
fn delete_algorithm_fails_without_successor_when_decks_exist() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let _ = add_deck(&db, algorithm_id, template_id, "Deck");

    let err = algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: algorithm_id,
            successor_id: None,
        },
    )
    .expect_err("deleting algorithm used by decks without successor should fail");

    assert_eq!(err.code, error_codes::NOT_FOUND_ALGORITHMS_DELETE_SUCCESSOR);
}

#[test]
fn delete_algorithm_fails_when_successor_does_not_exist() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let _ = add_deck(&db, algorithm_id, template_id, "Deck");

    let err = algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: algorithm_id,
            successor_id: Some(999_999),
        },
    )
    .expect_err("deleting algorithm with non-existent successor should fail");

    assert_eq!(err.code, error_codes::NOT_FOUND_ALGORITHMS_DELETE_SUCCESSOR);
}

#[test]
fn delete_algorithm_invalid_successor_does_not_mutate_decks_or_delete_algorithm() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");

    let result = algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: algorithm_id,
            successor_id: Some(999_999),
        },
    );
    assert!(result.is_err(), "delete should fail with invalid successor");

    let deck = koloda_native_tauri::repo::decks::get_deck(&db, deck_id)
        .expect("deck query should succeed")
        .expect("deck should exist");
    assert_eq!(
        deck.algorithm_id, algorithm_id,
        "deck algorithm should remain unchanged"
    );

    let algorithm = algorithms::get_algorithm(&db, algorithm_id).expect("query should succeed");
    assert!(algorithm.is_some(), "source algorithm should remain");
}
