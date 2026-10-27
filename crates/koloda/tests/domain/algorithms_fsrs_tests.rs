use koloda::domain::algorithms_fsrs::AlgorithmFSRS;
use serde_json::{json, Value};

/// Canonical valid FSRS payload used as the mutation base for JSON-shape contract cases.
fn valid_payload() -> Value {
    json!({
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    })
}

#[test]
fn test_valid_algorithm_full() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.4197,1.1869,3.0412,15.2441,7.1434,0.6477,1.0007,0.0754,1.6598,0.1719,1.1178,1.4699,0.134,0.016,1.7101,0.1543,0.9369,2.9664,0.714,0.201,0.0059",
        "isFuzzEnabled": true,
        "learningSteps": [[10, "m"], [1, "d"]],
        "relearningSteps": [[10, "m"]],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize valid JSON");
    algorithm.validate().unwrap();
}

#[test]
fn test_missing_required_fields_fail() {
    let required_fields = [
        "type",
        "retention",
        "weights",
        "isFuzzEnabled",
        "learningSteps",
        "relearningSteps",
        "maximumInterval",
    ];

    for field in required_fields {
        let mut payload = valid_payload();
        payload.as_object_mut().unwrap().remove(field);

        let result: Result<AlgorithmFSRS, _> = serde_json::from_value(payload);
        assert!(result.is_err(), "Should fail when {field} is missing");
    }

    let result: Result<AlgorithmFSRS, _> = serde_json::from_value(json!({}));
    assert!(result.is_err(), "Should fail when every field is missing");
}

#[test]
fn test_wrong_typed_fields_fail() {
    // WHY: Unknown fields carry no declared type and are tolerated (no `deny_unknown_fields`),
    // so extra members must never reject an otherwise valid payload.
    let mut payload = valid_payload();
    payload["extraField"] = json!("ignored");
    payload["anotherExtra"] = json!(123);

    let algorithm: AlgorithmFSRS = serde_json::from_value(payload).expect("Should deserialize ignoring extra fields");
    algorithm.validate().unwrap();

    let mistyped_fields = [
        ("type", json!(123)),
        ("type", json!(null)),
        ("retention", json!("90.0")),
        ("retention", json!(null)),
        ("isFuzzEnabled", json!("true")),
        // Steps must be `[amount, unit]` tuples, not plain strings.
        ("learningSteps", json!(["10m", "1d"])),
        ("maximumInterval", json!("36500")),
    ];

    for (field, offending) in mistyped_fields {
        let mut payload = valid_payload();
        payload[field] = offending.clone();

        let result: Result<AlgorithmFSRS, _> = serde_json::from_value(payload);
        assert!(result.is_err(), "Should fail when {field} is {offending}");
    }
}

fn assert_rejected(field: &str, offending: Value, expected_code: &str) {
    let mut payload = valid_payload();
    payload
        .as_object_mut()
        .expect("algorithm payload should be an object")
        .insert(field.to_string(), offending.clone());

    let algorithm: AlgorithmFSRS = serde_json::from_value(payload).expect("patched payload should still deserialize");
    let error = algorithm
        .validate()
        .expect_err("patched algorithm should fail validation");
    assert_eq!(
        error.code, expected_code,
        "{field} = {offending} must surface {expected_code}"
    );
}

#[test]
fn test_invalid_content_fails_with_field_codes() {
    // WHY: retention must be whole, so 69.9 and 99.1 fail even with a bound moved by one; 69 and 100 pin the bounds.
    // The TS twin asserts the same codes (`algorithms-fsrs.test.ts`).
    let cases: &[(&str, Value, &str)] = &[
        ("retention", json!(69.0), "validation.algorithm.fsrs.retention"),
        ("retention", json!(100.0), "validation.algorithm.fsrs.retention"),
        ("retention", json!(69.9), "validation.algorithm.fsrs.retention"),
        ("retention", json!(99.1), "validation.algorithm.fsrs.retention"),
        ("retention", json!(90.5), "validation.algorithm.fsrs.retention"),
        ("retention", json!(70.5), "validation.algorithm.fsrs.retention"),
        (
            "learningSteps",
            json!([[0, "m"]]),
            "validation.algorithm.fsrs.learning-steps.amount",
        ),
        (
            "learningSteps",
            json!([[-1, "m"]]),
            "validation.algorithm.fsrs.learning-steps.amount",
        ),
        (
            "learningSteps",
            json!([[10, "x"]]),
            "validation.algorithm.fsrs.learning-steps.unit",
        ),
        (
            "relearningSteps",
            json!([[0, "m"]]),
            "validation.algorithm.fsrs.relearning-steps.amount",
        ),
        (
            "relearningSteps",
            json!([[10, "week"]]),
            "validation.algorithm.fsrs.relearning-steps.unit",
        ),
        (
            "maximumInterval",
            json!(0),
            "validation.algorithm.fsrs.maximum-interval",
        ),
        (
            "maximumInterval",
            json!(-1),
            "validation.algorithm.fsrs.maximum-interval",
        ),
        ("weights", json!("0.5,0.5,0.5"), "validation.algorithm.fsrs.weights"),
        (
            "weights",
            json!(["0.5"; 22].join(",")),
            "validation.algorithm.fsrs.weights",
        ),
        (
            "weights",
            json!(weights_with("invalid")),
            "validation.algorithm.fsrs.weights",
        ),
        (
            "weights",
            json!(["Infinity"; 21].join(",")),
            "validation.algorithm.fsrs.weights",
        ),
        (
            "weights",
            json!(weights_with("-Infinity")),
            "validation.algorithm.fsrs.weights",
        ),
        (
            "weights",
            json!(weights_with("NaN")),
            "validation.algorithm.fsrs.weights",
        ),
        // Twin of the TS hexadecimal case: `Number("0x1f")` is finite, but `parse::<f64>()` rejects it.
        (
            "weights",
            json!(weights_with("0x1f")),
            "validation.algorithm.fsrs.weights",
        ),
        ("weights", json!(""), "validation.algorithm.fsrs.weights"),
    ];

    for (field, offending, code) in cases {
        assert_rejected(field, offending.clone(), code);
    }
}

/// Twenty-one weights of 0.5 with the second one replaced.
fn weights_with(second: &str) -> String {
    (0..21)
        .map(|index| if index == 1 { second } else { "0.5" })
        .collect::<Vec<_>>()
        .join(",")
}

#[test]
fn test_retention_minimum_boundary() {
    let json = r#"{
        "type": "fsrs",
        "retention": 70.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    algorithm.validate().unwrap();
}

#[test]
fn test_retention_maximum_boundary() {
    let json = r#"{
        "type": "fsrs",
        "retention": 99.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    algorithm.validate().unwrap();
}

#[test]
fn test_weights_exactly_21_values() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    algorithm.validate().unwrap();
}

#[test]
fn test_weights_with_spaces() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(algorithm.validate().is_ok(), "Should handle spaces in weights");
}

#[test]
fn test_learning_steps_empty_array() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    algorithm.validate().unwrap();
}

#[test]
fn test_learning_steps_valid_units() {
    let units = vec!["s", "m", "h", "d"];
    for unit in units {
        let json = format!(
            r#"{{
                "type": "fsrs",
                "retention": 90.0,
                "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
                "isFuzzEnabled": true,
                "learningSteps": [[10, "{}"]],
                "relearningSteps": [],
                "maximumInterval": 36500
            }}"#,
            unit
        );

        let algorithm: AlgorithmFSRS = serde_json::from_str(&json).expect("Should deserialize");
        assert!(algorithm.validate().is_ok(), "Unit '{}' should be valid", unit);
    }
}

#[test]
fn test_relearning_steps_empty_array() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    algorithm.validate().unwrap();
}

#[test]
fn test_relearning_steps_valid() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [[10, "m"], [1, "d"]],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    algorithm.validate().unwrap();
}

#[test]
fn test_maximum_interval_minimum() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 1
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    algorithm.validate().unwrap();
}

#[test]
fn test_maximum_interval_large_value() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 365000
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    algorithm.validate().unwrap();
}

#[test]
fn test_fractional_amounts_fail_deserialization() {
    // WHY: step amounts and `maximum_interval` are i64, so serde rejects a fraction before `validate()` runs.
    // The TS twin rejects the same values with each field's code (`algorithms-fsrs.test.ts`).
    let fractional_fields = [
        ("learningSteps", json!([[1.5, "m"]])),
        ("relearningSteps", json!([[2.5, "m"]])),
        ("maximumInterval", json!(10.5)),
    ];

    for (field, offending) in fractional_fields {
        let mut payload = valid_payload();
        payload[field] = offending.clone();

        let result: Result<AlgorithmFSRS, _> = serde_json::from_value(payload);
        assert!(result.is_err(), "Should fail when {field} is {offending}");
    }
}
