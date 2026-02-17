use koloda_native_tauri::domain::reviews::InsertReviewData;

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
    assert!(data.validate().is_ok());
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
        "difficulty": 1.0,
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

    assert!(data_min.validate().is_ok());
    assert!(data_max.validate().is_ok());
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
    assert!(data.validate().is_ok());
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
    assert!(data.validate().is_ok());
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
    assert!(data.validate().is_ok());
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
    assert!(data.validate().is_ok());
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
    assert!(data.validate().is_ok());
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
    assert!(data.validate().is_ok());
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
    assert!(data.validate().is_ok());
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
    assert!(data.validate().is_ok());
}

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

#[test]
fn test_rating_below_min_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 0,
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
    let result = data.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.reviews.rating");
}

#[test]
fn test_rating_above_max_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 5,
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
    let result = data.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.reviews.rating");
}

#[test]
fn test_rating_negative_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": -1,
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
    let result = data.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.reviews.rating");
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

#[test]
fn test_state_below_min_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": -1,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    let result = data.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.reviews.state");
}

#[test]
fn test_state_above_max_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 4,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    let result = data.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.reviews.state");
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

#[test]
fn test_stability_negative_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": -1.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    let result = data.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.reviews.stability");
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

#[test]
fn test_difficulty_below_min_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 0.9,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    let result = data.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.reviews.difficulty");
}

#[test]
fn test_difficulty_above_max_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 10.1,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    let result = data.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.reviews.difficulty");
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

#[test]
fn test_scheduled_days_negative_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": -1,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    let result = data.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.reviews.scheduled-days");
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

#[test]
fn test_learning_steps_negative_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": -1,
        "time": 0,
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    let result = data.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.reviews.learning-steps");
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

#[test]
fn test_time_negative_fails() {
    let json = r#"{
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": -1,
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    let result = data.validate();
    assert!(result.is_err());
    assert_eq!(result.unwrap_err().code, "validation.reviews.time");
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
