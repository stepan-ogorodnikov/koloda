mod common;

use koloda_core::domain::templates::{
    TemplateContent, TemplateField, TemplateLayoutItem, UpdateTemplateData, UpdateTemplateValues,
};

// ============================================================================
// HELPER FUNCTION FOR LOCKED TEMPLATE
// ============================================================================

fn create_original_template_content() -> TemplateContent {
    TemplateContent {
        fields: vec![
            TemplateField {
                id: 1,
                title: "Front".to_string(),
                field_type: "markdown".to_string(),
                is_required: true,
            },
            TemplateField {
                id: 2,
                title: "Back".to_string(),
                field_type: "text".to_string(),
                is_required: false,
            },
        ],
        layout: vec![
            TemplateLayoutItem {
                field: 1,
                operation: "display".to_string(),
            },
            TemplateLayoutItem {
                field: 2,
                operation: "reveal".to_string(),
            },
        ],
    }
}

// ============================================================================
// LOCKED TEMPLATE UPDATE VALIDATION
// ============================================================================

#[test]
fn test_locked_template_cannot_remove_fields() {
    let original = create_original_template_content();

    let json = r#"{
        "title": "Updated Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let values: UpdateTemplateValues = serde_json::from_str(json).expect("Should deserialize");
    let result = values.validate(Some(&original));
    assert!(result.is_err(), "Should fail when removing fields from locked template");
}

#[test]
fn test_locked_template_cannot_change_field_type() {
    let original = create_original_template_content();

    let json = r#"{
        "title": "Updated Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true},
                {"id": 2, "title": "Back", "type": "text", "isRequired": false}
            ],
            "layout": [
                {"field": 1, "operation": "display"},
                {"field": 2, "operation": "reveal"}
            ]
        }
    }"#;

    let values: UpdateTemplateValues = serde_json::from_str(json).expect("Should deserialize");
    let result = values.validate(Some(&original));
    assert!(
        result.is_err(),
        "Should fail when changing field type in locked template"
    );
}

#[test]
fn test_locked_template_cannot_change_is_required() {
    let original = create_original_template_content();

    let json = r#"{
        "title": "Updated Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "markdown", "isRequired": false},
                {"id": 2, "title": "Back", "type": "text", "isRequired": false}
            ],
            "layout": [
                {"field": 1, "operation": "display"},
                {"field": 2, "operation": "reveal"}
            ]
        }
    }"#;

    let values: UpdateTemplateValues = serde_json::from_str(json).expect("Should deserialize");
    let result = values.validate(Some(&original));
    assert!(
        result.is_err(),
        "Should fail when changing isRequired in locked template"
    );
}

#[test]
fn test_locked_template_can_change_field_title() {
    let original = create_original_template_content();

    let json = r#"{
        "title": "Updated Template",
        "content": {
            "fields": [
                {"id": 1, "title": "New Front Title", "type": "markdown", "isRequired": true},
                {"id": 2, "title": "Back", "type": "text", "isRequired": false}
            ],
            "layout": [
                {"field": 1, "operation": "display"},
                {"field": 2, "operation": "reveal"}
            ]
        }
    }"#;

    let values: UpdateTemplateValues = serde_json::from_str(json).expect("Should deserialize");
    let result = values.validate(Some(&original));
    assert!(result.is_ok(), "Should allow changing field title in locked template");
}

#[test]
fn test_locked_template_can_add_new_fields() {
    let original = create_original_template_content();

    let json = r#"{
        "title": "Updated Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "markdown", "isRequired": true},
                {"id": 2, "title": "Back", "type": "text", "isRequired": false},
                {"id": 3, "title": "New Field", "type": "text", "isRequired": false}
            ],
            "layout": [
                {"field": 1, "operation": "display"},
                {"field": 2, "operation": "reveal"},
                {"field": 3, "operation": "display"}
            ]
        }
    }"#;

    let values: UpdateTemplateValues = serde_json::from_str(json).expect("Should deserialize");
    let result = values.validate(Some(&original));
    assert!(result.is_ok(), "Should allow adding new fields to locked template");
}

// ============================================================================
// UPDATE TEMPLATE DATA
// ============================================================================

#[test]
fn test_update_template_data_missing_id() {
    let json = r#"{
        "values": {
            "title": "Updated Template",
            "content": {
                "fields": [
                    {"id": 1, "title": "Front", "type": "text", "isRequired": true}
                ],
                "layout": [
                    {"field": 1, "operation": "display"}
                ]
            }
        }
    }"#;

    let result: Result<UpdateTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when id is missing");
}

#[test]
fn test_update_template_data_missing_values() {
    let json = r#"{
        "id": 1
    }"#;

    let result: Result<UpdateTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when values is missing");
}

#[test]
fn test_update_template_data_extra_fields_ok() {
    let json = r#"{
        "id": 1,
        "values": {
            "title": "Updated Template",
            "content": {
                "fields": [
                    {"id": 1, "title": "Front", "type": "text", "isRequired": true}
                ],
                "layout": [
                    {"field": 1, "operation": "display"}
                ]
            }
        },
        "unknownField": "ignored"
    }"#;

    let result: Result<UpdateTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_ok(), "Should succeed with extra fields");
}

#[test]
fn test_update_template_data_id_invalid_type() {
    let json = r#"{
        "id": "not-a-number",
        "values": {
            "title": "Updated Template",
            "content": {
                "fields": [
                    {"id": 1, "title": "Front", "type": "text", "isRequired": true}
                ],
                "layout": [
                    {"field": 1, "operation": "display"}
                ]
            }
        }
    }"#;

    let result: Result<UpdateTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when id is a string");
}

#[test]
fn test_update_template_data_values_invalid_type() {
    let json = r#"{
        "id": 1,
        "values": "not-an-object"
    }"#;

    let result: Result<UpdateTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when values is a string");
}
