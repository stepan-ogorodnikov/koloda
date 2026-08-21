use koloda_core::domain::reviews::{calculate_todays_review_totals, InsertReviewData, ReviewTotals};
use koloda_core::domain::settings_learning::{CountedDailyLimit, DailyLimits};

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
        "difficulty": -0.1,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    }"#;

    let data: InsertReviewData = serde_json::from_str(json).expect("Should deserialize");
    let result = data.validate();
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

// ============================================================================
// CALCULATE TODAYS REVIEW TOTALS
// ============================================================================

fn counted_limit(value: u32, counts: bool) -> CountedDailyLimit {
    CountedDailyLimit { value, counts }
}

fn daily_limits(
    total: u32,
    untouched: CountedDailyLimit,
    learn: CountedDailyLimit,
    review: CountedDailyLimit,
) -> DailyLimits {
    DailyLimits {
        total,
        untouched,
        learn,
        review,
    }
}

fn totals(untouched: i64, learn: i64, review: i64) -> ReviewTotals {
    ReviewTotals {
        untouched,
        learn,
        review,
        total: untouched + learn + review,
    }
}

#[test]
fn test_calculate_todays_review_totals_all_under_limit_flags_false() {
    let limits = daily_limits(
        100,
        counted_limit(20, true),
        counted_limit(30, true),
        counted_limit(50, true),
    );

    let result = calculate_todays_review_totals(totals(1, 2, 3), limits);

    assert_eq!(result.review_totals.total, 6);
    assert!(!result.meta.is_untouched_over_the_limit);
    assert!(!result.meta.is_learn_over_the_limit);
    assert!(!result.meta.is_review_over_the_limit);
    assert!(!result.meta.is_total_over_the_limit);
}

#[test]
fn test_calculate_todays_review_totals_returns_daily_limits_unchanged() {
    let limits = daily_limits(
        10,
        counted_limit(2, true),
        counted_limit(3, false),
        counted_limit(4, true),
    );

    let result = calculate_todays_review_totals(totals(0, 0, 0), limits);

    assert_eq!(result.daily_limits.total, 10);
    assert_eq!(result.daily_limits.untouched.value, 2);
    assert!(result.daily_limits.untouched.counts);
    assert_eq!(result.daily_limits.learn.value, 3);
    assert!(!result.daily_limits.learn.counts);
    assert_eq!(result.daily_limits.review.value, 4);
    assert!(result.daily_limits.review.counts);
}

#[test]
fn test_calculate_todays_review_totals_replaces_total_with_counted_buckets_only() {
    let limits = daily_limits(
        100,
        counted_limit(20, false),
        counted_limit(30, true),
        counted_limit(50, true),
    );

    let result = calculate_todays_review_totals(totals(7, 2, 3), limits);

    assert_eq!(result.review_totals.total, 5, "only counted types contribute to total");
}

#[test]
fn test_calculate_todays_review_totals_marks_bucket_over_own_limit() {
    let limits = daily_limits(
        100,
        counted_limit(1, true),
        counted_limit(50, true),
        counted_limit(50, true),
    );

    let result = calculate_todays_review_totals(totals(2, 0, 0), limits);

    assert!(
        result.meta.is_untouched_over_the_limit,
        "bucket above its own limit should be over"
    );
    assert!(!result.meta.is_learn_over_the_limit);
    assert!(!result.meta.is_review_over_the_limit);
    assert!(!result.meta.is_total_over_the_limit, "total is below its limit");
}

#[test]
fn test_calculate_todays_review_totals_bucket_at_exact_own_limit_not_over() {
    let limits = daily_limits(
        0,
        counted_limit(2, true),
        counted_limit(50, true),
        counted_limit(50, true),
    );

    let result = calculate_todays_review_totals(totals(2, 0, 0), limits);

    assert!(
        !result.meta.is_untouched_over_the_limit,
        "bucket exactly at its own limit should not be over (strictly-greater semantics)"
    );
    assert!(!result.meta.is_total_over_the_limit, "zero total limit is no cap");
}

#[test]
fn test_calculate_todays_review_totals_counted_bucket_over_shared_total() {
    let limits = daily_limits(
        3,
        counted_limit(10, true),
        counted_limit(10, true),
        counted_limit(10, true),
    );

    // Every bucket is under its own limit of 10, but the shared total is reached.
    let result = calculate_todays_review_totals(totals(1, 1, 1), limits);

    assert!(
        result.meta.is_untouched_over_the_limit && result.meta.is_learn_over_the_limit,
        "counted buckets should respect the total limit"
    );
    assert!(result.meta.is_review_over_the_limit);
    assert!(result.meta.is_total_over_the_limit, "total at the limit (`>=`) is over");
}

#[test]
fn test_calculate_todays_review_totals_non_counted_bucket_ignores_total_limit() {
    let limits = daily_limits(
        1,
        counted_limit(10, false),
        counted_limit(10, true),
        counted_limit(10, true),
    );

    // Untouched does not count toward total; only learn+review (2) reach the total.
    let result = calculate_todays_review_totals(totals(5, 1, 1), limits);

    assert_eq!(result.review_totals.total, 2);
    assert!(
        !result.meta.is_untouched_over_the_limit,
        "non-counted type should ignore the total limit"
    );
    assert!(result.meta.is_learn_over_the_limit);
    assert!(result.meta.is_review_over_the_limit);
}

#[test]
fn test_calculate_todays_review_totals_zero_total_limit_is_no_cap() {
    let limits = daily_limits(
        0,
        counted_limit(10, true),
        counted_limit(10, true),
        counted_limit(10, true),
    );

    let result = calculate_todays_review_totals(totals(5, 5, 5), limits);

    assert!(!result.meta.is_untouched_over_the_limit);
    assert!(!result.meta.is_learn_over_the_limit);
    assert!(!result.meta.is_review_over_the_limit);
    assert!(
        !result.meta.is_total_over_the_limit,
        "a daily limit of zero is no cap, not a hard zero"
    );
}

#[test]
fn test_calculate_todays_review_totals_zero_activity_never_over_the_limit() {
    let limits = daily_limits(
        1,
        counted_limit(0, true),
        counted_limit(0, true),
        counted_limit(0, true),
    );

    let result = calculate_todays_review_totals(totals(0, 0, 0), limits);

    assert_eq!(result.review_totals.total, 0);
    assert!(!result.meta.is_untouched_over_the_limit);
    assert!(!result.meta.is_learn_over_the_limit);
    assert!(!result.meta.is_review_over_the_limit);
    assert!(
        !result.meta.is_total_over_the_limit,
        "no activity should never be flagged over the limit"
    );
}
