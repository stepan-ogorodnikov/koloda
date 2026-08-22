mod common;

use common::valid_card_progress_json;
use koloda_core::domain::lessons::LessonResultData;
use serde_json::json;

// ============================================================================
// REVIEW VALIDATION - RATING
// ============================================================================

#[test]
fn test_lesson_result_review_rating_below_min_fails() {
    let review = json!({
        "cardId": 1,
        "rating": 0,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.reviews.rating");
}

#[test]
fn test_lesson_result_review_rating_above_max_fails() {
    let review = json!({
        "cardId": 1,
        "rating": 5,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.reviews.rating");
}

// ============================================================================
// REVIEW VALIDATION - STATE
// ============================================================================

#[test]
fn test_lesson_result_review_state_below_min_fails() {
    let review = json!({
        "cardId": 1,
        "rating": 1,
        "state": -1,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.reviews.state");
}

#[test]
fn test_lesson_result_review_state_above_max_fails() {
    let review = json!({
        "cardId": 1,
        "rating": 1,
        "state": 5,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.reviews.state");
}

// ============================================================================
// REVIEW VALIDATION - STABILITY
// ============================================================================

#[test]
fn test_lesson_result_review_stability_zero_ok() {
    let review = json!({
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 0.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_review_stability_negative_fails() {
    let review = json!({
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": -1.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.reviews.stability");
}

// ============================================================================
// REVIEW VALIDATION - DIFFICULTY
// ============================================================================

#[test]
fn test_lesson_result_review_difficulty_min_ok() {
    let review = json!({
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 0.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_review_difficulty_max_ok() {
    let review = json!({
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 10.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_review_difficulty_below_min_fails() {
    let review = json!({
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": -0.1,
        "scheduledDays": 1,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.reviews.difficulty");
}

#[test]
fn test_lesson_result_review_difficulty_above_max_fails() {
    let review = json!({
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 10.1,
        "scheduledDays": 1,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.reviews.difficulty");
}

// ============================================================================
// REVIEW VALIDATION - SCHEDULED DAYS
// ============================================================================

#[test]
fn test_lesson_result_review_scheduled_days_zero_ok() {
    let review = json!({
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
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_review_scheduled_days_negative_fails() {
    let review = json!({
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
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.reviews.scheduled-days");
}

// ============================================================================
// REVIEW VALIDATION - LEARNING STEPS
// ============================================================================

#[test]
fn test_lesson_result_review_learning_steps_zero_ok() {
    let review = json!({
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_review_learning_steps_negative_fails() {
    let review = json!({
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": -1,
        "time": 0,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.reviews.learning-steps");
}

// ============================================================================
// REVIEW VALIDATION - TIME
// ============================================================================

#[test]
fn test_lesson_result_review_time_zero_ok() {
    let review = json!({
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_review_time_negative_fails() {
    let review = json!({
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "time": -1,
        "isIgnored": false
    });
    let data = json!({
        "card": valid_card_progress_json(),
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.reviews.time");
}
