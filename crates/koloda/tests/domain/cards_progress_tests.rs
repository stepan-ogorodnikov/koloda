use koloda::domain::cards::UpdateCardProgress;
use serde_json::{json, Value};

/// Canonical valid card-progress payload used as the mutation base for JSON-shape contract cases.
fn valid_payload() -> Value {
    json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    })
}

#[test]
fn test_missing_required_fields_fail() {
    let required_fields = [
        "id",
        "state",
        "dueAt",
        "stability",
        "difficulty",
        "scheduledDays",
        "learningSteps",
        "reps",
        "lapses",
    ];

    for field in required_fields {
        let mut payload = valid_payload();
        payload.as_object_mut().unwrap().remove(field);

        let result = serde_json::from_value::<UpdateCardProgress>(payload);
        assert!(result.is_err(), "Should fail when {field} is missing");
    }

    let result = serde_json::from_value::<UpdateCardProgress>(json!({}));
    assert!(result.is_err(), "Should fail when every field is missing");

    // WHY: only `lastReviewedAt` carries an explicit `#[serde(default)]`,
    // so absence must deserialize to `None` instead of failing.
    let progress: UpdateCardProgress =
        serde_json::from_value(valid_payload()).expect("`lastReviewedAt` should default when absent");
    assert_eq!(progress.last_reviewed_at, None);
}

#[test]
fn test_wrong_typed_fields_fail() {
    // WHY: Unknown fields carry no declared type and are tolerated (no `deny_unknown_fields`),
    // so extra members must never reject an otherwise valid payload.
    let mut payload = valid_payload();
    payload["lastReviewedAt"] = json!(null);
    payload["unknownField"] = json!("ignored");

    let progress =
        serde_json::from_value::<UpdateCardProgress>(payload).expect("Should deserialize ignoring extra fields");
    assert_eq!(progress.last_reviewed_at, None);

    let mistyped_fields = [
        ("id", json!("not-a-number")),
        ("state", json!("not-a-number")),
        ("dueAt", json!("not-a-timestamp")),
        ("stability", json!("not-a-number")),
        ("difficulty", json!("not-a-number")),
        ("scheduledDays", json!("not-a-number")),
        ("learningSteps", json!("not-a-number")),
        ("reps", json!("not-a-number")),
        ("lapses", json!("not-a-number")),
        ("lastReviewedAt", json!("not-a-timestamp")),
    ];

    for (field, offending) in mistyped_fields {
        let mut payload = valid_payload();
        payload[field] = offending.clone();

        let result = serde_json::from_value::<UpdateCardProgress>(payload);
        assert!(result.is_err(), "Should fail when {field} is {offending}");
    }
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
