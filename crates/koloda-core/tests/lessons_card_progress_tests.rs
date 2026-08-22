mod common;

use common::valid_review_json;
use koloda_core::domain::lessons::LessonResultData;
use serde_json::json;

// ============================================================================
// CARD PROGRESS VALIDATION - STATE
// ============================================================================

#[test]
fn test_lesson_result_card_state_above_max_fails() {
    let card = json!({
        "id": 1,
        "state": 4,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.state");
}

#[test]
fn test_lesson_result_card_state_negative_fails() {
    let card = json!({
        "id": 1,
        "state": -1,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.state");
}

// ============================================================================
// CARD PROGRESS VALIDATION - STABILITY
// ============================================================================

#[test]
fn test_lesson_result_card_stability_zero_ok() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 0.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_card_stability_negative_fails() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": -1.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.stability"
    );
}

// ============================================================================
// CARD PROGRESS VALIDATION - DIFFICULTY
// ============================================================================

#[test]
fn test_lesson_result_card_difficulty_min_ok() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 0.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_card_difficulty_max_ok() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 10.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_card_difficulty_below_min_fails() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": -0.1,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.difficulty"
    );
}

#[test]
fn test_lesson_result_card_difficulty_above_max_fails() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 10.1,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.difficulty"
    );
}

// ============================================================================
// CARD PROGRESS VALIDATION - SCHEDULED DAYS
// ============================================================================

#[test]
fn test_lesson_result_card_scheduled_days_zero_ok() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_card_scheduled_days_negative_fails() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": -1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.scheduled-days"
    );
}

// ============================================================================
// CARD PROGRESS VALIDATION - LEARNING STEPS
// ============================================================================

#[test]
fn test_lesson_result_card_learning_steps_zero_ok() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_card_learning_steps_negative_fails() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": -1,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.learning-steps"
    );
}

// ============================================================================
// CARD PROGRESS VALIDATION - REPS
// ============================================================================

#[test]
fn test_lesson_result_card_reps_zero_ok() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_card_reps_negative_fails() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": -1,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.reps");
}

// ============================================================================
// CARD PROGRESS VALIDATION - LAPSES
// ============================================================================

#[test]
fn test_lesson_result_card_lapses_zero_ok() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_card_lapses_negative_fails() {
    let card = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": -1,
        "lastReviewedAt": null
    });
    let data = json!({
        "card": card,
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.lapses");
}
