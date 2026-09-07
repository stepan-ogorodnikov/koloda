use crate::common::{valid_card_progress_json, valid_review_json};
use koloda::domain::lessons::LessonResultData;
use serde_json::{json, Value};

/// Canonical valid lesson-result payload used as the mutation base for validation cases.
fn valid_payload() -> Value {
    json!({
        "card": valid_card_progress_json(),
        "review": valid_review_json(),
    })
}

/// WHY: Card validation runs before review validation, so a single-field patch on one
/// section isolates that entity's error-code namespace (`cards-progress.*` vs `reviews.*`).
fn assert_rejected(section: &str, field: &str, offending: Value, expected_code: &str) {
    let mut payload = valid_payload();
    payload
        .get_mut(section)
        .expect("payload should contain the patched section")
        .as_object_mut()
        .expect("patched section should be an object")
        .insert(field.to_string(), offending.clone());

    let data = serde_json::from_value::<LessonResultData>(payload).expect("patched payload should still deserialize");
    let error = data
        .validate()
        .expect_err("patched lesson result should fail validation");
    assert_eq!(
        error.code, expected_code,
        "{section}.{field} = {offending} must surface {expected_code}"
    );
}

fn assert_accepted(section: &str, field: &str, value: Value) {
    let mut payload = valid_payload();
    payload
        .get_mut(section)
        .expect("payload should contain the patched section")
        .as_object_mut()
        .expect("patched section should be an object")
        .insert(field.to_string(), value.clone());

    let data = serde_json::from_value::<LessonResultData>(payload).expect("patched payload should still deserialize");
    let observed = data.validate().err().map(|error| error.code);
    assert!(
        observed.is_none(),
        "{section}.{field} = {value} must pass validation, got {observed:?}"
    );
}

// WHY: Several former zero-ok cases patched fields whose asserted value already equals
// this baseline (learningSteps/reps/lapses/time), so the unmutated payload subsumes them.
#[test]
fn test_lesson_result_valid_payload_passes() {
    serde_json::from_value::<LessonResultData>(valid_payload())
        .expect("canonical payload should deserialize")
        .validate()
        .unwrap();
}

#[test]
fn test_lesson_result_card_out_of_bounds_values_fail_with_field_codes() {
    // WHY: FSRS card states span New..=Relearning (0..=3); -1 and 4 probe both edges of
    // that band. Every remaining field only enforces non-negativity / its declared range,
    // so a single offender per row pins the entity-specific code per field.
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
        assert_rejected("card", field, offending.clone(), code);
    }
}

#[test]
fn test_lesson_result_card_boundary_values_pass() {
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
        assert_accepted("card", field, value.clone());
    }
}

#[test]
fn test_lesson_result_review_out_of_bounds_values_fail_with_field_codes() {
    // WHY: Reviews share the state band (0..=3) and progress bounds but swap the card's
    // reps/lapses for rating (1..=4) and time (>= 0), so their offenders pin the
    // review-namespace codes for fields the card side does not have.
    let cases: &[(&str, Value, &str)] = &[
        ("rating", json!(0), "validation.reviews.rating"),
        ("rating", json!(5), "validation.reviews.rating"),
        ("state", json!(-1), "validation.reviews.state"),
        ("state", json!(5), "validation.reviews.state"),
        ("stability", json!(-1.0), "validation.reviews.stability"),
        ("difficulty", json!(-0.1), "validation.reviews.difficulty"),
        ("difficulty", json!(10.1), "validation.reviews.difficulty"),
        ("scheduledDays", json!(-1), "validation.reviews.scheduled-days"),
        ("learningSteps", json!(-1), "validation.reviews.learning-steps"),
        ("time", json!(-1), "validation.reviews.time"),
    ];

    for (field, offending, code) in cases {
        assert_rejected("review", field, offending.clone(), code);
    }
}

#[test]
fn test_lesson_result_review_boundary_values_pass() {
    let cases: &[(&str, Value)] = &[
        ("stability", json!(0.0)),
        ("difficulty", json!(0.0)),
        ("difficulty", json!(10.0)),
        ("scheduledDays", json!(0)),
        ("learningSteps", json!(0)),
        ("time", json!(0)),
    ];

    for (field, value) in cases {
        assert_accepted("review", field, value.clone());
    }
}
