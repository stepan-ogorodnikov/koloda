use koloda_native_tauri::domain::algorithms_fsrs::AlgorithmFSRS;

// ============================================================================
// VALID ALGORITHM TESTS
// ============================================================================

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
    assert!(algorithm.validate().is_ok());
}

// ============================================================================
// MISSING FIELDS TESTS
// ============================================================================

#[test]
fn test_missing_type_fails() {
    let json = r#"{
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when type is missing");
}

#[test]
fn test_missing_retention_fails() {
    let json = r#"{
        "type": "fsrs",
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when retention is missing");
}

#[test]
fn test_missing_weights_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when weights is missing");
}

#[test]
fn test_missing_is_fuzz_enabled_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when isFuzzEnabled is missing");
}

#[test]
fn test_missing_learning_steps_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when learningSteps is missing");
}

#[test]
fn test_missing_relearning_steps_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "maximumInterval": 36500
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when relearningSteps is missing");
}

#[test]
fn test_missing_maximum_interval_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": []
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when maximumInterval is missing");
}

#[test]
fn test_empty_json_object_fails() {
    let json = r#"{}"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail with empty JSON");
}

// ============================================================================
// EXTRA FIELDS TESTS
// ============================================================================

#[test]
fn test_extra_fields_ignored() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500,
        "extraField": "ignored",
        "anotherExtra": 123
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize ignoring extra fields");
    assert!(algorithm.validate().is_ok());
}

// ============================================================================
// TYPE FIELD TESTS
// ============================================================================

#[test]
fn test_type_as_number_fails() {
    let json = r#"{
        "type": 123,
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when type is a number");
}

#[test]
fn test_type_as_null_fails() {
    let json = r#"{
        "type": null,
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when type is null");
}

// ============================================================================
// RETENTION FIELD TESTS
// ============================================================================

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
    assert!(algorithm.validate().is_ok());
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
    assert!(algorithm.validate().is_ok());
}

#[test]
fn test_retention_below_minimum_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 69.9,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(algorithm.validate().is_err(), "Should fail when retention < 70");
}

#[test]
fn test_retention_above_maximum_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 99.1,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(algorithm.validate().is_err(), "Should fail when retention > 99");
}

#[test]
fn test_retention_as_string_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": "90.0",
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when retention is a string");
}

#[test]
fn test_retention_as_null_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": null,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when retention is null");
}

// ============================================================================
// WEIGHTS FIELD TESTS
// ============================================================================

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
    assert!(algorithm.validate().is_ok());
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
fn test_weights_too_few_values_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(
        algorithm.validate().is_err(),
        "Should fail when weights has < 21 values"
    );
}

#[test]
fn test_weights_too_many_values_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(
        algorithm.validate().is_err(),
        "Should fail when weights has > 21 values"
    );
}

#[test]
fn test_weights_non_numeric_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,invalid,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(
        algorithm.validate().is_err(),
        "Should fail when weights contains non-numeric"
    );
}

#[test]
fn test_weights_empty_string_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(algorithm.validate().is_err(), "Should fail when weights is empty");
}

// ============================================================================
// IS_FUZZ_ENABLED FIELD TESTS
// ============================================================================

#[test]
fn test_is_fuzz_enabled_true() {
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
    assert!(algorithm.validate().is_ok());
    assert!(algorithm.is_fuzz_enabled);
}

#[test]
fn test_is_fuzz_enabled_false() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": false,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(algorithm.validate().is_ok());
    assert!(!algorithm.is_fuzz_enabled);
}

#[test]
fn test_is_fuzz_enabled_as_string_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": "true",
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when isFuzzEnabled is a string");
}

// ============================================================================
// LEARNING_STEPS FIELD TESTS
// ============================================================================

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
    assert!(algorithm.validate().is_ok());
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
fn test_learning_steps_invalid_unit_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [[10, "x"]],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(algorithm.validate().is_err(), "Should fail with invalid unit");
}

#[test]
fn test_learning_steps_zero_amount_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [[0, "m"]],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(algorithm.validate().is_err(), "Should fail with zero amount");
}

#[test]
fn test_learning_steps_negative_amount_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [[-1, "m"]],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(algorithm.validate().is_err(), "Should fail with negative amount");
}

#[test]
fn test_learning_steps_wrong_format_string_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": ["10m", "1d"],
        "relearningSteps": [],
        "maximumInterval": 36500
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when steps are strings instead of tuples");
}

// ============================================================================
// RELEARNING_STEPS FIELD TESTS
// ============================================================================

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
    assert!(algorithm.validate().is_ok());
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
    assert!(algorithm.validate().is_ok());
}

#[test]
fn test_relearning_steps_zero_amount_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [[0, "m"]],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(algorithm.validate().is_err(), "Should fail with zero amount");
}

#[test]
fn test_relearning_steps_invalid_unit_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [[10, "week"]],
        "maximumInterval": 36500
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(algorithm.validate().is_err(), "Should fail with invalid unit");
}

// ============================================================================
// MAXIMUM_INTERVAL FIELD TESTS
// ============================================================================

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
    assert!(algorithm.validate().is_ok());
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
    assert!(algorithm.validate().is_ok());
}

#[test]
fn test_maximum_interval_zero_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": 0
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(algorithm.validate().is_err(), "Should fail with zero interval");
}

#[test]
fn test_maximum_interval_negative_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": -1
    }"#;

    let algorithm: AlgorithmFSRS = serde_json::from_str(json).expect("Should deserialize");
    assert!(algorithm.validate().is_err(), "Should fail with negative interval");
}

#[test]
fn test_maximum_interval_as_string_fails() {
    let json = r#"{
        "type": "fsrs",
        "retention": 90.0,
        "weights": "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
        "isFuzzEnabled": true,
        "learningSteps": [],
        "relearningSteps": [],
        "maximumInterval": "36500"
    }"#;

    let result: Result<AlgorithmFSRS, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when maximumInterval is a string");
}
