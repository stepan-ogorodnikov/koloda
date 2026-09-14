use koloda::domain::decks::{InsertDeckData, UpdateDeckData};
use serde_json::json;

const ALGORITHM_ID: &str = "01900000-0000-7000-8000-000000000001";
const TEMPLATE_ID: &str = "01900000-0000-7000-8000-000000000002";

fn insert_data(algorithm_id: &str, template_id: &str) -> InsertDeckData {
    serde_json::from_value(json!({
        "title": "German",
        "algorithmId": algorithm_id,
        "templateId": template_id,
    }))
    .expect("Should deserialize deck insert data")
}

fn update_data(algorithm_id: &str, template_id: &str) -> UpdateDeckData {
    serde_json::from_value(json!({
        "id": "01900000-0000-7000-8000-000000000003",
        "values": {
            "title": "German",
            "algorithmId": algorithm_id,
            "templateId": template_id,
        },
    }))
    .expect("Should deserialize deck update data")
}

#[test]
fn test_insert_deck_malformed_algorithm_id_fails_with_dedicated_code() {
    // Twin of the TS `rejects a malformed algorithmId` case — `z.uuid()`
    // rejects what the repo existence check used to report as not-found.
    let err = insert_data("not-a-uuid", TEMPLATE_ID).validate().unwrap_err();
    assert_eq!(err.code, "validation.decks.algorithm");
}

#[test]
fn test_insert_deck_malformed_template_id_fails_with_dedicated_code() {
    let err = insert_data(ALGORITHM_ID, "simple").validate().unwrap_err();
    assert_eq!(err.code, "validation.decks.template");
}

#[test]
fn test_update_deck_malformed_algorithm_id_fails_with_dedicated_code() {
    let err = update_data("01900000000070008000000000000001", TEMPLATE_ID)
        .values
        .validate()
        .unwrap_err();
    assert_eq!(err.code, "validation.decks.algorithm");
}

#[test]
fn test_update_deck_malformed_template_id_fails_with_dedicated_code() {
    let err = update_data(ALGORITHM_ID, "").values.validate().unwrap_err();
    assert_eq!(err.code, "validation.decks.template");
}

#[test]
fn test_deck_well_formed_ids_pass_format_validation() {
    // Well-formed but nonexistent ids must pass `validate()` — the repo
    // existence checks still report those as `not-found.decks.*`.
    insert_data(
        "01900000-0000-7000-8000-0000000f423f",
        "01900000-0000-7000-8000-0000000f4240",
    )
    .validate()
    .unwrap();
    update_data(
        "01900000-0000-7000-8000-0000000f423f",
        "01900000-0000-7000-8000-0000000f4240",
    )
    .values
    .validate()
    .unwrap();
}
