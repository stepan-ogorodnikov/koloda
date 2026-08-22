mod common;

use koloda_core::domain::cards::UpdateCardProgress;
use serde_json::json;

// ============================================================================
// UPDATE CARD PROGRESS - MISSING FIELDS
// ============================================================================

#[test]
fn test_update_card_progress_missing_id() {
    let data = json!({
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_missing_state() {
    let data = json!({
        "id": 1,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_missing_due_at() {
    let data = json!({
        "id": 1,
        "state": 0,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_missing_stability() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_missing_difficulty() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_missing_scheduled_days() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_missing_learning_steps() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_missing_reps() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_missing_lapses() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_missing_last_reviewed_at_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap();
}

// ============================================================================
// UPDATE CARD PROGRESS - EXTRA FIELDS
// ============================================================================

#[test]
fn test_update_card_progress_extra_fields_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null,
        "unknownField": "ignored"
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap();
}

// ============================================================================
// UPDATE CARD PROGRESS - INVALID TYPES
// ============================================================================

#[test]
fn test_update_card_progress_id_invalid_type() {
    let data = json!({
        "id": "not-a-number",
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_state_invalid_type() {
    let data = json!({
        "id": 1,
        "state": "not-a-number",
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_due_at_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": "not-a-timestamp",
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_stability_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": "not-a-number",
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_difficulty_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": "not-a-number",
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_scheduled_days_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": "not-a-number",
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_learning_steps_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": "not-a-number",
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_reps_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": "not-a-number",
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_lapses_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": "not-a-number"
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

#[test]
fn test_update_card_progress_last_reviewed_at_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": "not-a-timestamp"
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap_err();
}

// ============================================================================
// UPDATE CARD PROGRESS - STATE (Dispatcher)
// ============================================================================

#[test]
fn test_update_card_progress_state_valid() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_update_card_progress_state_all_valid() {
    for state in 0..=3 {
        let data = json!({
            "id": 1,
            "state": state,
            "dueAt": 1000000000,
            "stability": 5.0,
            "difficulty": 5.0,
            "scheduledDays": 1,
            "learningSteps": 0,
            "reps": 0,
            "lapses": 0
        });
        let result = serde_json::from_value::<UpdateCardProgress>(data);
        assert!(result.unwrap().validate().is_ok(), "State {} should be valid", state);
    }
}

#[test]
fn test_update_card_progress_state_above_max_fails() {
    let data = json!({
        "id": 1,
        "state": 4,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.state");
}

#[test]
fn test_update_card_progress_state_negative_fails() {
    let data = json!({
        "id": 1,
        "state": -1,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.state");
}

// ============================================================================
// UPDATE CARD PROGRESS - STABILITY
// ============================================================================

#[test]
fn test_update_card_progress_stability_zero_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 0.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_update_card_progress_stability_negative_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": -1.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.stability"
    );
}

// ============================================================================
// UPDATE CARD PROGRESS - DIFFICULTY
// ============================================================================

#[test]
fn test_update_card_progress_difficulty_min_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 0.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_update_card_progress_difficulty_max_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 10.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_update_card_progress_difficulty_below_min_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": -0.1,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.difficulty"
    );
}

#[test]
fn test_update_card_progress_difficulty_above_max_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 10.1,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.difficulty"
    );
}

// ============================================================================
// UPDATE CARD PROGRESS - SCHEDULED DAYS
// ============================================================================

#[test]
fn test_update_card_progress_scheduled_days_zero_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_update_card_progress_scheduled_days_negative_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": -1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.scheduled-days"
    );
}

// ============================================================================
// UPDATE CARD PROGRESS - LEARNING STEPS
// ============================================================================

#[test]
fn test_update_card_progress_learning_steps_zero_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_update_card_progress_learning_steps_negative_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": -1,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.learning-steps"
    );
}

// ============================================================================
// UPDATE CARD PROGRESS - REPS
// ============================================================================

#[test]
fn test_update_card_progress_reps_zero_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_update_card_progress_reps_negative_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": -1,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.reps");
}

// ============================================================================
// UPDATE CARD PROGRESS - LAPSES
// ============================================================================

#[test]
fn test_update_card_progress_lapses_zero_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_update_card_progress_lapses_negative_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": -1
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.lapses");
}
