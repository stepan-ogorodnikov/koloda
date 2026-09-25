use koloda::domain::cards::UpdateCardProgress;
use serde_json::{json, Value};

/// Canonical valid card-progress payload used as the mutation base for JSON-shape and bound cases.
fn valid_payload() -> Value {
    json!({
        "id": "01900000-0000-7000-8000-000000000001",
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

fn assert_rejected(field: &str, offending: Value, expected_code: &str) {
    let mut payload = valid_payload();
    payload
        .as_object_mut()
        .expect("progress payload should be an object")
        .insert(field.to_string(), offending.clone());

    let data = serde_json::from_value::<UpdateCardProgress>(payload).expect("patched payload should still deserialize");
    let error = data
        .validate()
        .expect_err("patched card progress should fail validation");
    assert_eq!(
        error.code, expected_code,
        "{field} = {offending} must surface {expected_code}"
    );
}

fn assert_accepted(field: &str, value: Value) {
    let mut payload = valid_payload();
    payload
        .as_object_mut()
        .expect("progress payload should be an object")
        .insert(field.to_string(), value.clone());

    let data = serde_json::from_value::<UpdateCardProgress>(payload).expect("patched payload should still deserialize");
    let observed = data.validate().err().map(|error| error.code);
    assert!(
        observed.is_none(),
        "{field} = {value} must pass validation, got {observed:?}"
    );
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
        ("id", json!(1)),
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
fn test_update_card_progress_valid_payload_passes() {
    serde_json::from_value::<UpdateCardProgress>(valid_payload())
        .expect("canonical payload should deserialize")
        .validate()
        .unwrap();

    // WHY: FSRS card states span New..=Relearning (0..=3). The baseline already
    // carries state 0; the rest of the band is patched here so a dropped state
    // guard fails this test.
    for state in 0..=3 {
        assert_accepted("state", json!(state));
    }
}

#[test]
fn test_update_card_progress_out_of_bounds_values_fail_with_field_codes() {
    // WHY: FSRS card states span New..=Relearning (0..=3); -1 and 4 probe both edges
    // of that band (4 is one past the max, not a farther miss). Every remaining field
    // only enforces non-negativity or its declared range, so one offender per row pins
    // the cards-progress code.
    let cases: &[(&str, Value, &str)] = &[
        ("state", json!(-1), "validation.cards-progress.state"),
        ("state", json!(4), "validation.cards-progress.state"),
        ("stability", json!(-1.0), "validation.cards-progress.stability"),
        ("difficulty", json!(-0.1), "validation.cards-progress.difficulty"),
        ("difficulty", json!(10.1), "validation.cards-progress.difficulty"),
        ("scheduledDays", json!(-1), "validation.cards-progress.scheduled-days"),
        ("learningSteps", json!(-1), "validation.cards-progress.learning-steps"),
        ("reps", json!(-1), "validation.cards-progress.reps"),
        ("lapses", json!(-1), "validation.cards-progress.lapses"),
    ];

    for (field, offending, code) in cases {
        assert_rejected(field, offending.clone(), code);
    }
}

#[test]
fn test_update_card_progress_boundary_values_pass() {
    // Difficulty is inclusive on both ends ([0, 10]); the counters accept their floor.
    let cases: &[(&str, Value)] = &[
        ("stability", json!(0.0)),
        ("difficulty", json!(0.0)),
        ("difficulty", json!(10.0)),
        ("scheduledDays", json!(0)),
        ("learningSteps", json!(0)),
        ("reps", json!(0)),
        ("lapses", json!(0)),
    ];

    for (field, value) in cases {
        assert_accepted(field, value.clone());
    }
}
