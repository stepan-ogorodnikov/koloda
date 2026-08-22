mod common;

use koloda_core::domain::reviews::InsertReviewData;

// ============================================================================
// VALID REVIEW
// ============================================================================

#[test]
fn test_valid_review_data() {
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
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    data.validate().unwrap();
}

#[test]
fn test_valid_review_all_ratings() {
    for rating in 1..=4 {
        let json = format!(
            r#"{{
                "cardId": 1,
                "rating": {},
                "state": 0,
                "dueAt": null,
                "stability": 5.0,
                "difficulty": 5.0,
                "scheduledDays": 0,
                "learningSteps": 0,
                "time": 0,
                "isIgnored": false
            }}"#,
            rating
        );

        let data: InsertReviewData = serde_json::from_str(&json).expect("Should deserialize");
        assert!(data.validate().is_ok(), "Rating {} should be valid", rating);
    }
}

#[test]
fn test_valid_review_all_states() {
    for state in 0..=3 {
        let json = format!(
            r#"{{
                "cardId": 1,
                "rating": 1,
                "state": {},
                "dueAt": null,
                "stability": 5.0,
                "difficulty": 5.0,
                "scheduledDays": 0,
                "learningSteps": 0,
                "time": 0,
                "isIgnored": false
            }}"#,
            state
        );

        let data: InsertReviewData = serde_json::from_str(&json).expect("Should deserialize");
        assert!(data.validate().is_ok(), "State {} should be valid", state);
    }
}

#[test]
fn test_valid_review_difficulty_boundaries() {
    let json_min = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 0.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let json_max = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 10.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let data_min: InsertReviewData = serde_json::from_str(json_min).expect("Should deserialize");
    let data_max: InsertReviewData = serde_json::from_str(json_max).expect("Should deserialize");

    data_min.validate().unwrap();
    data_max.validate().unwrap();
}

#[test]
fn test_valid_stability_zero() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 0.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    data.validate().unwrap();
}

#[test]
fn test_valid_stability_large_value() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 365.0,
        "difficulty": 5.0,
        "scheduledDays": 100,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    data.validate().unwrap();
}

#[test]
fn test_valid_scheduled_days_zero() {
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
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    data.validate().unwrap();
}

#[test]
fn test_valid_learning_steps_zero() {
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
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    data.validate().unwrap();
}

#[test]
fn test_valid_time_zero() {
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
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    data.validate().unwrap();
}

#[test]
fn test_valid_time_positive() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 5000,
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    data.validate().unwrap();
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
