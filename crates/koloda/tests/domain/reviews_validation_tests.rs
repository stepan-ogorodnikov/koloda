use koloda::domain::reviews::InsertReviewData;
use serde_json::{json, Value};

/// Canonical valid insert-review payload used as the mutation base for validation cases.
fn valid_payload() -> Value {
    crate::common::valid_review_json()
}

fn assert_rejected(field: &str, offending: Value, expected_code: &str) {
    let mut payload = valid_payload();
    payload
        .as_object_mut()
        .expect("review payload should be an object")
        .insert(field.to_string(), offending.clone());

    let data = serde_json::from_value::<InsertReviewData>(payload).expect("patched payload should still deserialize");
    let error = data.validate().expect_err("patched review should fail validation");
    assert_eq!(
        error.code, expected_code,
        "{field} = {offending} must surface {expected_code}"
    );
}

fn assert_accepted(field: &str, value: Value) {
    let mut payload = valid_payload();
    payload
        .as_object_mut()
        .expect("review payload should be an object")
        .insert(field.to_string(), value.clone());

    let data = serde_json::from_value::<InsertReviewData>(payload).expect("patched payload should still deserialize");
    let observed = data.validate().err().map(|error| error.code);
    assert!(
        observed.is_none(),
        "{field} = {value} must pass validation, got {observed:?}"
    );
}

#[test]
fn test_insert_review_valid_payload_passes() {
    serde_json::from_value::<InsertReviewData>(valid_payload())
        .expect("canonical payload should deserialize")
        .validate()
        .unwrap();
}

#[test]
fn test_insert_review_out_of_bounds_values_fail_with_field_codes() {
    // WHY: FSRS review states span 0..=3; -1 and 4 probe both edges of that band
    // (4 is one past the max, not a farther miss). Rating is 1..=4. Remaining fields
    // only enforce non-negativity or a declared range, so one offender per edge pins
    // the review-namespace code.
    let cases: &[(&str, Value, &str)] = &[
        ("rating", json!(0), "validation.reviews.rating"),
        ("rating", json!(5), "validation.reviews.rating"),
        ("rating", json!(-1), "validation.reviews.rating"),
        ("state", json!(-1), "validation.reviews.state"),
        ("state", json!(4), "validation.reviews.state"),
        ("stability", json!(-1.0), "validation.reviews.stability"),
        ("difficulty", json!(-0.1), "validation.reviews.difficulty"),
        ("difficulty", json!(10.1), "validation.reviews.difficulty"),
        ("scheduledDays", json!(-1), "validation.reviews.scheduled-days"),
        ("learningSteps", json!(-1), "validation.reviews.learning-steps"),
        ("time", json!(-1), "validation.reviews.time"),
    ];

    for (field, offending, code) in cases {
        assert_rejected(field, offending.clone(), code);
    }
}

#[test]
fn test_insert_review_boundary_values_pass() {
    // Rating is inclusive on 1..=4, state on 0..=3, difficulty on [0, 10].
    // The counters and time accept their floor of zero.
    let cases: &[(&str, Value)] = &[
        ("rating", json!(1)),
        ("rating", json!(4)),
        ("state", json!(0)),
        ("state", json!(3)),
        ("stability", json!(0.0)),
        ("difficulty", json!(0.0)),
        ("difficulty", json!(10.0)),
        ("scheduledDays", json!(0)),
        ("learningSteps", json!(0)),
        ("time", json!(0)),
    ];

    for (field, value) in cases {
        assert_accepted(field, value.clone());
    }
}
