use koloda::app::db::Database;
use koloda::app::error::error_codes;
use koloda::domain::algorithms::{
    CloneAlgorithmData, DeleteAlgorithmData, InsertAlgorithmData, UpdateAlgorithmData, UpdateAlgorithmValues,
};
use koloda::domain::algorithms_fsrs::AlgorithmFSRS;
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
                notes: None,
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
fn delete_algorithm_fails_when_successor_is_itself() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let _other_algorithm_id = add_algorithm(&db, "Other FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, &algorithm_id, &template_id, "Deck");

    let err = algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: algorithm_id.clone(),
            successor_id: Some(algorithm_id.clone()),
        },
    )
    .expect_err("deleting algorithm with itself as successor should fail");

    assert_eq!(err.code, error_codes::NOT_FOUND_ALGORITHMS_DELETE_SUCCESSOR);

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
fn delete_algorithm_fails_closed_when_learning_settings_are_invalid() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "Old FSRS");
    let _other_algorithm_id = add_algorithm(&db, "Other FSRS");

    // Valid JSON, invalid schema — a present-but-invalid row must not read as "absent"
    // (`learning_defaults` skips only while learning settings are absent, pre-seed).
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO settings (name, content, created_at) VALUES ('learning', '{\"dayStartsAt\": 42}', 1)",
            [],
        )
        .map(|_| ())
        .map_err(koloda::app::error::AppError::from)
    })
    .expect("corrupt learning row should be inserted");

    let err = algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: algorithm_id.clone(),
            successor_id: None,
        },
    )
    .expect_err("deleting with corrupt learning settings should fail");

    assert_eq!(err.code, error_codes::DB_DELETE);
    assert!(
        algorithms::get_algorithm(&db, &algorithm_id)
            .expect("query should succeed")
            .is_some(),
        "algorithm should remain after the failed delete"
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

struct Revision {
    content: AlgorithmFSRS,
    actor: String,
    created_at: i64,
}

fn revisions(db: &Database, algorithm_id: &str) -> Vec<Revision> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT content, actor, created_at FROM algorithm_revisions WHERE algorithm_id = ?1 ORDER BY created_at, id",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![algorithm_id], |row| {
                let content: String = row.get(0)?;
                Ok(Revision {
                    content: serde_json::from_str(&content).expect("revision content should be FSRS JSON"),
                    actor: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
    .expect("revisions query should succeed")
}

fn update_values(title: &str, content: AlgorithmFSRS, notes: Option<&str>) -> UpdateAlgorithmValues {
    UpdateAlgorithmValues {
        title: title.to_string(),
        content,
        notes: notes.map(str::to_string),
    }
}

#[test]
fn add_algorithm_records_starting_parameters() {
    let db = test_db();
    let content = AlgorithmFSRS {
        retention: 85.0,
        ..fsrs_algorithm_content()
    };

    let algorithm = algorithms::add_algorithm(
        &db,
        InsertAlgorithmData {
            title: "Added".to_string(),
            content: content.clone(),
        },
    )
    .expect("algorithm should be created");

    let revisions = revisions(&db, &algorithm.id);
    assert_eq!(revisions.len(), 1);
    assert_eq!(revisions[0].content, content);
    // Actor JSON is a wire contract shared with TS.
    assert_eq!(revisions[0].actor, r#"{"kind":"user"}"#);
    assert_eq!(revisions[0].created_at, algorithm.created_at);
}

#[test]
fn clone_algorithm_starts_its_own_history_and_leaves_the_source_alone() {
    let db = test_db();
    let source_id = add_algorithm(&db, "Source");

    let cloned = algorithms::clone_algorithm(
        &db,
        CloneAlgorithmData {
            title: "Clone".to_string(),
            source_id: source_id.clone(),
        },
    )
    .expect("clone should succeed");

    let cloned_revisions = revisions(&db, &cloned.id);
    assert_eq!(cloned_revisions.len(), 1);
    assert_eq!(cloned_revisions[0].content, fsrs_algorithm_content());
    assert_eq!(revisions(&db, &source_id).len(), 1);
}

#[test]
fn update_algorithm_appends_a_revision_when_parameters_change() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let content = AlgorithmFSRS {
        retention: 92.0,
        ..fsrs_algorithm_content()
    };

    let updated = algorithms::update_algorithm(
        &db,
        UpdateAlgorithmData {
            id: algorithm_id.clone(),
            values: update_values("FSRS", content.clone(), None),
        },
    )
    .expect("update should succeed");

    let revisions = revisions(&db, &algorithm_id);
    assert_eq!(revisions.len(), 2);
    assert_eq!(revisions[1].content, content);
    assert_eq!(revisions[1].actor, r#"{"kind":"user"}"#);
    assert_eq!(Some(revisions[1].created_at), updated.updated_at);
}

#[test]
fn update_algorithm_records_nothing_when_parameters_do_not_change() {
    let cases = [
        ("title only", update_values("Renamed", fsrs_algorithm_content(), None)),
        (
            "notes only",
            update_values("FSRS", fsrs_algorithm_content(), Some("Vocabulary")),
        ),
        ("nothing", update_values("FSRS", fsrs_algorithm_content(), None)),
    ];

    for (name, values) in cases {
        let db = test_db();
        let algorithm_id = add_algorithm(&db, "FSRS");

        algorithms::update_algorithm(
            &db,
            UpdateAlgorithmData {
                id: algorithm_id.clone(),
                values,
            },
        )
        .expect("update should succeed");

        assert_eq!(
            revisions(&db, &algorithm_id).len(),
            1,
            "a save changing {name} records nothing"
        );
    }
}

#[test]
fn update_algorithm_records_nothing_when_rejected() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let content = AlgorithmFSRS {
        retention: 50.0,
        ..fsrs_algorithm_content()
    };

    algorithms::update_algorithm(
        &db,
        UpdateAlgorithmData {
            id: algorithm_id.clone(),
            values: update_values("FSRS", content, None),
        },
    )
    .expect_err("an out-of-range retention should be rejected");

    assert_eq!(revisions(&db, &algorithm_id).len(), 1);
}

#[test]
fn delete_algorithm_keeps_history() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let _remaining_id = add_algorithm(&db, "Remaining");

    algorithms::delete_algorithm(
        &db,
        DeleteAlgorithmData {
            id: algorithm_id.clone(),
            successor_id: None,
        },
    )
    .expect("delete should succeed");

    assert_eq!(revisions(&db, &algorithm_id).len(), 1);
}
