mod common;

use common::{valid_card_progress_json, valid_review_json};
use koloda_core::domain::lessons::LessonResultData;
use serde_json::json;

// ============================================================================
// LESSON RESULT DATA - MISSING FIELDS
// ============================================================================

#[test]
fn test_lesson_result_missing_card() {
    let data = json!({
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap_err();
}

#[test]
fn test_lesson_result_missing_review() {
    let data = json!({
        "card": valid_card_progress_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap_err();
}

// ============================================================================
// LESSON RESULT DATA - EXTRA FIELDS
// ============================================================================

#[test]
fn test_lesson_result_extra_fields_ok() {
    let data = json!({
        "card": valid_card_progress_json(),
        "review": valid_review_json(),
        "unknownField": "ignored"
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap();
}

// ============================================================================
// LESSON RESULT DATA - INVALID TYPES
// ============================================================================

#[test]
fn test_lesson_result_card_invalid_type() {
    let data = json!({
        "card": "not-an-object",
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap_err();
}

#[test]
fn test_lesson_result_review_invalid_type() {
    let data = json!({
        "card": valid_card_progress_json(),
        "review": "not-an-object"
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap_err();
}

// ============================================================================
// LESSON RESULT DATA - VALID
// ============================================================================

#[test]
fn test_lesson_result_valid() {
    let data = json!({
        "card": valid_card_progress_json(),
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_all_ratings_valid() {
    for rating in 1..=4 {
        let review = json!({
            "cardId": 1,
            "rating": rating,
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
        assert!(result.unwrap().validate().is_ok(), "Rating {} should be valid", rating);
    }
}

#[test]
fn test_lesson_result_all_states_valid() {
    for state in 0..=3 {
        let card = json!({
            "id": 1,
            "state": state,
            "dueAt": 1000000000,
            "stability": 5.0,
            "difficulty": 5.0,
            "scheduledDays": 1,
            "learningSteps": 0,
            "reps": 0,
            "lapses": 0,
            "lastReviewedAt": null
        });
        let review = json!({
            "cardId": 1,
            "rating": 1,
            "state": state,
            "dueAt": null,
            "stability": 5.0,
            "difficulty": 5.0,
            "scheduledDays": 1,
            "learningSteps": 0,
            "time": 0,
            "isIgnored": false
        });
        let data = json!({
            "card": card,
            "review": review
        });
        let result = serde_json::from_value::<LessonResultData>(data);
        assert!(result.unwrap().validate().is_ok(), "State {} should be valid", state);
    }
}
