mod common;

use koloda_core::domain::templates::CloneTemplateData;

// ============================================================================
// CLONE TEMPLATE DATA
// ============================================================================

#[test]
fn test_clone_template_data_missing_title() {
    let json = r#"{
        "sourceId": 1
    }"#;

    let result: Result<CloneTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when title is missing");
}

#[test]
fn test_clone_template_data_missing_source_id() {
    let json = r#"{
        "title": "New Template"
    }"#;

    let result: Result<CloneTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when sourceId is missing");
}

#[test]
fn test_clone_template_data_extra_fields_ok() {
    let json = r#"{
        "title": "New Template",
        "sourceId": 1,
        "unknownField": "ignored"
    }"#;

    let result: Result<CloneTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_ok(), "Should succeed with extra fields");
}

#[test]
fn test_clone_template_data_title_invalid_type() {
    let json = r#"{
        "title": 123,
        "sourceId": 1
    }"#;

    let result: Result<CloneTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when title is a number");
}

#[test]
fn test_clone_template_data_source_id_invalid_type() {
    let json = r#"{
        "title": "New Template",
        "sourceId": "not-a-number"
    }"#;

    let result: Result<CloneTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when sourceId is a string");
}

#[test]
fn test_clone_template_data_valid() {
    let json = r#"{
        "title": "New Template",
        "sourceId": 1
    }"#;

    let result: Result<CloneTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_ok(), "Should succeed with valid data");
}
