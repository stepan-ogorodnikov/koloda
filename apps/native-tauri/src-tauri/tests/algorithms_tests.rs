use koloda_native_tauri::domain::algorithms::{
    CloneAlgorithmData, DeleteAlgorithmData, InsertAlgorithmData, UpdateAlgorithmData, UpdateAlgorithmValues,
};

const VALID_FSRS_CONTENT: &str = r#"{
    "type": "fsrs",
    "retention": 90.0,
    "weights": "0.4197,1.1869,3.0412,15.2441,7.1434,0.6477,1.0007,0.0754,1.6598,0.1719,1.1178,1.4699,0.134,0.016,1.7101,0.1543,0.9369,2.9664,0.714,0.201,0.0059",
    "isFuzzEnabled": true,
    "learningSteps": [[10, "m"], [1, "d"]],
    "relearningSteps": [[10, "m"]],
    "maximumInterval": 36500
}"#;

// ============================================================================
// VALID ALGORITHM
// ============================================================================

#[test]
fn test_insert_valid_fsrs_algorithm() {
    let json = format!(
        r#"{{
            "title": "Valid Title",
            "content": {}
        }}"#,
        VALID_FSRS_CONTENT
    );

    let data: InsertAlgorithmData = serde_json::from_str(&json).expect("Should deserialize");
    assert!(data.validate().is_ok());
}

#[test]
fn test_update_valid_algorithm() {
    let json = format!(
        r#"{{
            "id": 1,
            "values": {{
                "title": "Updated Title",
                "content": {}
            }}
        }}"#,
        VALID_FSRS_CONTENT
    );

    let data: UpdateAlgorithmData = serde_json::from_str(&json).expect("Should deserialize");
    assert!(data.values.validate().is_ok());
}

#[test]
fn test_update_values_direct_validation() {
    let json = format!(
        r#"{{
            "title": "Updated Title",
            "content": {}
        }}"#,
        VALID_FSRS_CONTENT
    );

    let values: UpdateAlgorithmValues = serde_json::from_str(&json).expect("Should deserialize");
    assert!(values.validate().is_ok());
}

// ============================================================================
// MISSING FIELDS
// ============================================================================

#[test]
fn test_insert_missing_title_field_fails() {
    let json = format!(
        r#"{{
            "content": {}
        }}"#,
        VALID_FSRS_CONTENT
    );

    let result: Result<InsertAlgorithmData, _> = serde_json::from_str(&json);
    assert!(result.is_err());
}

// ============================================================================
// EXTRA FIELDS
// ============================================================================

#[test]
fn test_algorithm_with_extra_fields_ignored() {
    let json = format!(
        r#"{{
            "title": "Test Algorithm",
            "content": {},
            "extraField": "ignored",
            "anotherExtra": 123
        }}"#,
        VALID_FSRS_CONTENT
    );

    let data: InsertAlgorithmData = serde_json::from_str(&json).expect("Should deserialize");
    assert!(data.validate().is_ok());
}

// ============================================================================
// TITLE FIELD
// ============================================================================

#[test]
fn test_title_empty_fails() {
    let json = format!(
        r#"{{
            "title": "",
            "content": {}
        }}"#,
        VALID_FSRS_CONTENT
    );

    let data: InsertAlgorithmData = serde_json::from_str(&json).expect("Should deserialize");
    assert!(data.validate().is_err());
}

#[test]
fn test_title_too_long_fails() {
    let json = format!(
        r#"{{
            "title": "{}",
            "content": {}
        }}"#,
        "a".repeat(256),
        VALID_FSRS_CONTENT
    );

    let data: InsertAlgorithmData = serde_json::from_str(&json).expect("Should deserialize");
    assert!(data.validate().is_err());
}

#[test]
fn test_title_unicode_ok() {
    let json = format!(
        r#"{{
            "title": "Алгоритм ФСРС 🧠",
            "content": {}
        }}"#,
        VALID_FSRS_CONTENT
    );

    let data: InsertAlgorithmData = serde_json::from_str(&json).expect("Should deserialize");
    assert!(data.validate().is_ok());
    assert_eq!(data.title, "Алгоритм ФСРС 🧠");
}

// ============================================================================
// ALGORITHM TYPE
// ============================================================================

#[test]
fn test_unknown_algorithm_type_fails() {
    let json = r#"{
        "title": "Test Algorithm",
        "content": {
            "type": "supermemo",
            "param1": 123
        }
    }"#;

    let data: InsertAlgorithmData = serde_json::from_str(json).expect("Should deserialize");
    assert!(data.validate().is_err());
}

// ============================================================================
// CLONE ALGORITHM DATA
// ============================================================================

#[test]
fn test_clone_algorithm_valid() {
    let json = r#"{
        "title": "Cloned Algorithm",
        "sourceId": 42
    }"#;

    let data: CloneAlgorithmData = serde_json::from_str(json).expect("Should deserialize");
    assert_eq!(data.title, "Cloned Algorithm");
    assert_eq!(data.source_id, 42);
}

#[test]
fn test_clone_algorithm_missing_title_fails() {
    let json = r#"{
        "sourceId": 42
    }"#;

    let result: Result<CloneAlgorithmData, _> = serde_json::from_str(json);
    assert!(result.is_err());
}

#[test]
fn test_clone_algorithm_missing_source_id_fails() {
    let json = r#"{
        "title": "Cloned Algorithm"
    }"#;

    let result: Result<CloneAlgorithmData, _> = serde_json::from_str(json);
    assert!(result.is_err());
}

// ============================================================================
// DELETE ALGORITHM DATA
// ============================================================================

#[test]
fn test_delete_algorithm_with_successor() {
    let json = r#"{
        "id": 1,
        "successorId": 2
    }"#;

    let data: DeleteAlgorithmData = serde_json::from_str(json).expect("Should deserialize");
    assert_eq!(data.id, 1);
    assert_eq!(data.successor_id, Some(2));
}

#[test]
fn test_delete_algorithm_without_successor() {
    let json = r#"{
        "id": 1
    }"#;

    let data: DeleteAlgorithmData = serde_json::from_str(json).expect("Should deserialize");
    assert_eq!(data.id, 1);
    assert_eq!(data.successor_id, None);
}
