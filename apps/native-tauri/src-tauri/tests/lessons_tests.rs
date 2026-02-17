use koloda_native_tauri::domain::lessons::LessonResultData;
use serde_json::json;

fn valid_card_progress_json() -> serde_json::Value {
    json!({
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
    })
}

fn valid_review_json() -> serde_json::Value {
    json!({
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
    })
}

#[allow(dead_code)]
fn create_valid_lesson_result() -> LessonResultData {
    LessonResultData {
        card: serde_json::from_value(valid_card_progress_json()).unwrap(),
        review: serde_json::from_value(valid_review_json()).unwrap(),
    }
}

// ============================================================================
// LESSON RESULT DATA - MISSING FIELDS
// ============================================================================

#[test]
fn test_lesson_result_missing_card() {
    let data = json!({
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    assert!(result.is_err());
}

#[test]
fn test_lesson_result_missing_review() {
    let data = json!({
        "card": valid_card_progress_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    assert!(result.is_err());
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
    assert!(result.is_ok());
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
    assert!(result.is_err());
}

#[test]
fn test_lesson_result_review_invalid_type() {
    let data = json!({
        "card": valid_card_progress_json(),
        "review": "not-an-object"
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    assert!(result.is_err());
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
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
        assert!(result.is_ok());
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
        assert!(result.is_ok());
        assert!(result.unwrap().validate().is_ok(), "State {} should be valid", state);
    }
}

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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.lapses");
}

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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
        "difficulty": 1.0,
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_lesson_result_review_difficulty_below_min_fails() {
    let review = json!({
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": null,
        "stability": 5.0,
        "difficulty": 0.9,
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
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
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(validation_result.unwrap_err().code, "validation.reviews.time");
}
