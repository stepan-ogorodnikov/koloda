mod common;

use koloda_core::domain::reviews::InsertReviewData;

// ============================================================================
// CARD ID FIELD
// ============================================================================

#[test]
fn test_card_id_as_string_fails() {
    let json = r#"{
        "cardId": "1",
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when cardId is a string");
}

// ============================================================================
// RATING FIELD
// ============================================================================

#[test]
fn test_rating_as_string_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": "1",
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when rating is a string");
}

#[test]
fn test_rating_as_null_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": null,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when rating is null");
}

// ============================================================================
// STATE FIELD
// ============================================================================

#[test]
fn test_state_as_string_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": "0",
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when state is a string");
}

#[test]
fn test_state_as_null_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": null,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when state is null");
}

// ============================================================================
// DUE AT FIELD
// ============================================================================

#[test]
fn test_due_at_as_string_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": "1234567890",
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when dueAt is a string");
}

// ============================================================================
// STABILITY FIELD
// ============================================================================

#[test]
fn test_stability_as_string_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": "5.0",
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when stability is a string");
}

#[test]
fn test_stability_as_null_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": null,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when stability is null");
}

// ============================================================================
// DIFFICULTY FIELD
// ============================================================================

#[test]
fn test_difficulty_as_string_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": "5.0",
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when difficulty is a string");
}

#[test]
fn test_difficulty_as_null_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": null,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when difficulty is null");
}

// ============================================================================
// SCHEDULED DAYS FIELD
// ============================================================================

#[test]
fn test_scheduled_days_as_string_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": "0",
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when scheduledDays is a string");
}

#[test]
fn test_scheduled_days_as_null_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": null,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when scheduledDays is null");
}

// ============================================================================
// LEARNING STEPS FIELD
// ============================================================================

#[test]
fn test_learning_steps_as_string_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": "0",
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when learningSteps is a string");
}

#[test]
fn test_learning_steps_as_null_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": null,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when learningSteps is null");
}

// ============================================================================
// TIME FIELD
// ============================================================================

#[test]
fn test_time_as_string_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": "0",
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when time is a string");
}

#[test]
fn test_time_as_null_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": null,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when time is null");
}

// ============================================================================
// IS IGNORED FIELD
// ============================================================================

#[test]
fn test_is_ignored_as_string_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": "false"
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when isIgnored is a string");
}

#[test]
fn test_is_ignored_as_null_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": null
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when isIgnored is null");
}

// ============================================================================
// MISSING FIELDS
// ============================================================================

#[test]
fn test_missing_card_id_fails() {
    let json = r#"{
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when cardId is missing");
}

#[test]
fn test_missing_rating_fails() {
    let json = r#"{
        "cardId": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when rating is missing");
}

#[test]
fn test_missing_state_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when state is missing");
}

#[test]
fn test_missing_due_at_defaults_to_null() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    data.validate().unwrap();
    assert!(data.due_at.is_none());
}

#[test]
fn test_missing_stability_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when stability is missing");
}

#[test]
fn test_missing_difficulty_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when difficulty is missing");
}

#[test]
fn test_missing_scheduled_days_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when scheduledDays is missing");
}

#[test]
fn test_missing_learning_steps_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when learningSteps is missing");
}

#[test]
fn test_missing_time_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "isIgnored": false
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when time is missing");
}

#[test]
fn test_missing_is_ignored_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0
    }"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when isIgnored is missing");
}

#[test]
fn test_empty_json_object_fails() {
    let json = r#"{}"#;

    let result: Result<InsertReviewData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail with empty JSON");
}

// ============================================================================
// EXTRA FIELDS
// ============================================================================

#[test]
fn test_extra_fields_ignored() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false,
        "nonexistent": "ignored",
        "another": 123
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize ignoring extra fields");
    data.validate().unwrap();
}
