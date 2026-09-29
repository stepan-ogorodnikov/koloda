//! Entity notes — twin of `libs/srs/src/lib/titles.test.ts` (§notes) and the TS
//! `optionalEntityNotesSchema`. Notes are optional plain text at the boundary
//! both hosts call: trim, whitespace-only becomes absent (NULL), max 1024 UTF-16
//! units; a missing or null key deserializes to `None`.

use koloda::domain::algorithms::{Algorithm, UpdateAlgorithmValues};
use koloda::domain::algorithms_fsrs::AlgorithmFSRS;
use koloda::domain::common::{normalize_optional_notes, NOTES_MAX_LENGTH};
use koloda::domain::decks::UpdateDeckValues;
use koloda::domain::templates::{TemplateContent, UpdateTemplateValues};
use serde_json::json;

const ID: &str = "01900000-0000-7000-8000-000000000001";

// WHY: fixtures return Result and unwrap inside #[test] fns — clippy's
// allow-unwrap-in-tests covers test fns, not helpers.
type FixtureResult<T> = Result<T, serde_json::Error>;

fn update_deck_values(notes: serde_json::Value) -> FixtureResult<UpdateDeckValues> {
    serde_json::from_value(json!({
        "title": "German",
        "algorithmId": ID,
        "templateId": ID,
        "notes": notes
    }))
}

fn update_template_values(notes: serde_json::Value) -> FixtureResult<UpdateTemplateValues> {
    let content: TemplateContent = serde_json::from_value(json!({
        "fields": [{ "id": ID, "title": "Front", "type": "text", "isRequired": true }],
        "layout": [{ "field": ID, "operation": "display" }]
    }))?;
    serde_json::from_value(json!({
        "title": "Basic",
        "content": content,
        "notes": notes
    }))
}

fn update_algorithm_values(notes: serde_json::Value) -> FixtureResult<UpdateAlgorithmValues> {
    let content: AlgorithmFSRS = serde_json::from_value(json!({
        "type": "fsrs",
        "retention": 90,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [[60, "m"], [600, "m"]],
        "relearningSteps": [[600, "m"]],
        "maximumInterval": 3650
    }))?;
    serde_json::from_value(json!({
        "title": "FSRS",
        "content": content,
        "notes": notes
    }))
}

#[test]
fn test_missing_notes_key_deserializes_to_none() {
    let data = json!({
        "title": "German",
        "algorithmId": ID,
        "templateId": ID
    });
    let values: UpdateDeckValues = serde_json::from_value(data).unwrap();
    assert_eq!(values.notes, None);
    values.validate().unwrap();
}

#[test]
fn test_null_notes_deserialize_to_none() {
    let values = update_deck_values(serde_json::Value::Null).unwrap();
    assert_eq!(values.notes, None);
    values.validate().unwrap();
}

#[test]
fn test_update_deck_notes_within_limit_ok() {
    update_deck_values(json!("Use this preset for vocabulary, not cramming"))
        .unwrap()
        .validate()
        .unwrap();
}

#[test]
fn test_update_template_notes_within_limit_ok() {
    update_template_values(json!("Source: chapter 3 exercises"))
        .unwrap()
        .validate(None)
        .unwrap();
}

#[test]
fn test_update_algorithm_notes_within_limit_ok() {
    update_algorithm_values(json!("Vocabulary preset"))
        .unwrap()
        .validate()
        .unwrap();
}

#[test]
fn test_update_deck_notes_over_limit_fails() {
    let values = update_deck_values(json!("a".repeat(NOTES_MAX_LENGTH + 1))).unwrap();
    let err = values.validate().unwrap_err();
    assert_eq!(err.code, "validation.common.notes.too-long");
}

#[test]
fn test_update_template_notes_over_limit_fails() {
    let values = update_template_values(json!("a".repeat(NOTES_MAX_LENGTH + 1))).unwrap();
    let err = values.validate(None).unwrap_err();
    assert_eq!(err.code, "validation.common.notes.too-long");
}

#[test]
fn test_update_algorithm_notes_over_limit_fails() {
    let values = update_algorithm_values(json!("a".repeat(NOTES_MAX_LENGTH + 1))).unwrap();
    let err = values.validate().unwrap_err();
    assert_eq!(err.code, "validation.common.notes.too-long");
}

#[test]
fn test_notes_count_utf16_units_not_bytes() {
    // NOTE_MAX_LENGTH/2 emoji are 1026 UTF-16 units but 2048 UTF-8 bytes — byte
    // counting would reject a note the TS zod mirror (JS `.length`) accepts.
    let crab = '\u{1F980}';
    let note: String = std::iter::repeat_n(crab, NOTES_MAX_LENGTH / 2 + 1).collect();
    let values = update_deck_values(json!(note)).unwrap();
    let err = values.validate().unwrap_err();
    assert_eq!(err.code, "validation.common.notes.too-long");
}

#[test]
fn test_normalize_optional_notes_trims_and_clears_whitespace() {
    assert_eq!(
        normalize_optional_notes(Some("  For vocabulary  ".to_string())),
        Some("For vocabulary".to_string())
    );
    assert_eq!(normalize_optional_notes(Some("   ".to_string())), None);
    assert_eq!(normalize_optional_notes(None), None);
}

#[test]
fn test_algorithm_notes_round_trip_through_serde() {
    let algorithm = Algorithm {
        id: ID.to_string(),
        title: "FSRS".to_string(),
        content: update_algorithm_values(json!("Vocabulary")).unwrap().content,
        notes: Some("Vocabulary".to_string()),
        created_at: 0,
        updated_at: None,
    };
    let serialized = serde_json::to_value(&algorithm).unwrap();
    assert_eq!(serialized["notes"], json!("Vocabulary"));

    let deserialized: Algorithm = serde_json::from_value(serialized).unwrap();
    assert_eq!(deserialized, algorithm);
}
