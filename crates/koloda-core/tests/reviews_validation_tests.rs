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
// RATING FIELD
// ============================================================================

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
// STABILITY FIELD
// ============================================================================

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
