use koloda::app::error::error_codes;
use koloda::domain::algorithms::{DeleteAlgorithmData, UpdateAlgorithmData, UpdateAlgorithmValues};
use koloda::domain::settings::SettingsName;
use koloda::repo::algorithms;

use crate::common::fixtures::{add_algorithm, add_deck, add_template};
use crate::common::{fsrs_algorithm_content, learning_settings, test_db};

#[test]
fn update_algorithm_fails_with_not_found_when_algorithm_is_missing() {
    let db = test_db();

    let err = algorithms::update_algorithm(
        &db,
        UpdateAlgorithmData {
            id: "01900000-0000-7000-8000-0000000f423f".to_string(),
            values: UpdateAlgorithmValues {
                title: "Renamed FSRS".to_string(),
                content: fsrs_algorithm_content(),
            },
        },
    )
    .expect_err("updating a missing algorithm should fail");

    assert_eq!(err.code, error_codes::NOT_FOUND_ALGORITHMS_UPDATE_ALGORITHM);
}

#[test]
fn delete_algorithm_reassigns_decks_to_successor() {
    let db = test_db();
    let old_algorithm_id = add_algorithm(&db, "Old FSRS");
    let successor_algorithm_id = add_algorithm(&db, "New FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, &old_algorithm_id, &template_id, "Deck");

    algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: old_algorithm_id.clone(),
            successor_id: Some(successor_algorithm_id.clone()),
        },
    )
    .expect("algorithm delete with successor should succeed");

    let deck = koloda::repo::decks::get_deck(&db, &deck_id)
        .expect("deck query should succeed")
        .expect("deck should exist");
    assert_eq!(deck.algorithm_id, successor_algorithm_id);

    let deleted_algorithm = algorithms::get_algorithm(&db, &old_algorithm_id).expect("query should succeed");
    assert!(deleted_algorithm.is_none());
}

#[test]
fn delete_algorithm_fails_without_successor_when_decks_exist() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let _other_algorithm_id = add_algorithm(&db, "Other FSRS");
    let template_id = add_template(&db, "Basic");
    let _ = add_deck(&db, &algorithm_id, &template_id, "Deck");

    let err = algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: algorithm_id.clone(),
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
    let _other_algorithm_id = add_algorithm(&db, "Other FSRS");
    let template_id = add_template(&db, "Basic");
    let _ = add_deck(&db, &algorithm_id, &template_id, "Deck");

    let err = algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: algorithm_id.clone(),
            successor_id: Some("01900000-0000-7000-8000-0000000f423f".to_string()),
        },
    )
    .expect_err("deleting algorithm with non-existent successor should fail");

    assert_eq!(err.code, error_codes::NOT_FOUND_ALGORITHMS_DELETE_SUCCESSOR);
}

#[test]
fn delete_algorithm_fails_while_it_is_the_learning_default() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "Default FSRS");
    let _other_algorithm_id = add_algorithm(&db, "Other FSRS");
    let template_id = add_template(&db, "Basic");

    let mut learning = learning_settings(100, 20, 30, 50);
    learning["defaults"]["algorithm"] = algorithm_id.clone().into();
    learning["defaults"]["template"] = template_id.into();
    koloda::repo::settings::set_settings(&db, SettingsName::Learning, learning)
        .expect("learning settings should be set");

    let err = algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: algorithm_id.clone(),
            successor_id: None,
        },
    )
    .expect_err("deleting the learning-default algorithm should fail");

    assert_eq!(err.code, error_codes::VALIDATION_ALGORITHMS_DELETE_DEFAULT);
    assert!(
        algorithms::get_algorithm(&db, &algorithm_id)
            .expect("query should succeed")
            .is_some(),
        "default algorithm should remain"
    );
}

#[test]
fn delete_algorithm_fails_when_it_is_the_only_algorithm_left() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");

    let err = algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: algorithm_id,
            successor_id: None,
        },
    )
    .expect_err("deleting the only algorithm should fail");

    assert_eq!(err.code, error_codes::VALIDATION_ALGORITHMS_DELETE_LAST);
}

#[test]
fn delete_algorithm_succeeds_after_the_default_moves_elsewhere() {
    let db = test_db();
    let former_default_id = add_algorithm(&db, "Old FSRS");
    let new_default_id = add_algorithm(&db, "New FSRS");
    let template_id = add_template(&db, "Basic");

    let mut learning = learning_settings(100, 20, 30, 50);
    learning["defaults"]["algorithm"] = new_default_id.into();
    learning["defaults"]["template"] = template_id.into();
    koloda::repo::settings::set_settings(&db, SettingsName::Learning, learning)
        .expect("learning settings should be set");

    algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: former_default_id.clone(),
            successor_id: None,
        },
    )
    .expect("a former default should be deletable once the default moves elsewhere");

    assert!(
        algorithms::get_algorithm(&db, &former_default_id)
            .expect("query should succeed")
            .is_none(),
        "former default algorithm should be deleted"
    );
}

#[test]
fn delete_algorithm_invalid_successor_does_not_mutate_decks_or_delete_algorithm() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, &algorithm_id, &template_id, "Deck");

    let result = algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: algorithm_id.clone(),
            successor_id: Some("01900000-0000-7000-8000-0000000f423f".to_string()),
        },
    );
    assert!(result.is_err(), "delete should fail with invalid successor");

    let deck = koloda::repo::decks::get_deck(&db, &deck_id)
        .expect("deck query should succeed")
        .expect("deck should exist");
    assert_eq!(
        deck.algorithm_id, algorithm_id,
        "deck algorithm should remain unchanged"
    );

    let algorithm = algorithms::get_algorithm(&db, &algorithm_id).expect("query should succeed");
    assert!(algorithm.is_some(), "source algorithm should remain");
}
