use koloda::domain::templates::{
    TemplateContent, TemplateField, TemplateLayoutItem, UpdateTemplateData, UpdateTemplateValues,
};

fn create_original_template_content() -> TemplateContent {
    TemplateContent {
        fields: vec![
            TemplateField {
                id: "01900000-0000-7000-8000-000000000001".to_string(),
                title: "Front".to_string(),
                field_type: "markdown".to_string(),
                is_required: true,
            },
            TemplateField {
                id: "01900000-0000-7000-8000-000000000002".to_string(),
                title: "Back".to_string(),
                field_type: "text".to_string(),
                is_required: false,
            },
        ],
        layout: vec![
            TemplateLayoutItem {
                field: "01900000-0000-7000-8000-000000000001".to_string(),
                operation: "display".to_string(),
            },
            TemplateLayoutItem {
                field: "01900000-0000-7000-8000-000000000002".to_string(),
                operation: "reveal".to_string(),
            },
        ],
    }
}

#[test]
fn test_locked_template_cannot_remove_fields() {
    let original = create_original_template_content();

    let json = r#"{
        "title": "Updated Template",
        "content": {
            "fields": [
                {"id": "01900000-0000-7000-8000-000000000001", "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": "01900000-0000-7000-8000-000000000001", "operation": "display"}
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
                {"id": "01900000-0000-7000-8000-000000000001", "title": "Front", "type": "text", "isRequired": true},
                {"id": "01900000-0000-7000-8000-000000000002", "title": "Back", "type": "text", "isRequired": false}
            ],
            "layout": [
                {"field": "01900000-0000-7000-8000-000000000001", "operation": "display"},
                {"field": "01900000-0000-7000-8000-000000000002", "operation": "reveal"}
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
                {"id": "01900000-0000-7000-8000-000000000001", "title": "Front", "type": "markdown", "isRequired": false},
                {"id": "01900000-0000-7000-8000-000000000002", "title": "Back", "type": "text", "isRequired": false}
            ],
            "layout": [
                {"field": "01900000-0000-7000-8000-000000000001", "operation": "display"},
                {"field": "01900000-0000-7000-8000-000000000002", "operation": "reveal"}
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
                {"id": "01900000-0000-7000-8000-000000000001", "title": "New Front Title", "type": "markdown", "isRequired": true},
                {"id": "01900000-0000-7000-8000-000000000002", "title": "Back", "type": "text", "isRequired": false}
            ],
            "layout": [
                {"field": "01900000-0000-7000-8000-000000000001", "operation": "display"},
                {"field": "01900000-0000-7000-8000-000000000002", "operation": "reveal"}
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
                {"id": "01900000-0000-7000-8000-000000000001", "title": "Front", "type": "markdown", "isRequired": true},
                {"id": "01900000-0000-7000-8000-000000000002", "title": "Back", "type": "text", "isRequired": false},
                {"id": "01900000-0000-7000-8000-000000000003", "title": "New Field", "type": "text", "isRequired": false}
            ],
            "layout": [
                {"field": "01900000-0000-7000-8000-000000000001", "operation": "display"},
                {"field": "01900000-0000-7000-8000-000000000002", "operation": "reveal"},
                {"field": "01900000-0000-7000-8000-000000000003", "operation": "display"}
            ]
        }
    }"#;

    let values: UpdateTemplateValues = serde_json::from_str(json).expect("Should deserialize");
    let result = values.validate(Some(&original));
    assert!(result.is_ok(), "Should allow adding new fields to locked template");
}

#[test]
fn test_update_template_data_missing_id() {
    let json = r#"{
        "values": {
            "title": "Updated Template",
            "content": {
                "fields": [
                    {"id": "01900000-0000-7000-8000-000000000001", "title": "Front", "type": "text", "isRequired": true}
                ],
                "layout": [
                    {"field": "01900000-0000-7000-8000-000000000001", "operation": "display"}
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
        "id": "01900000-0000-7000-8000-000000000001"
    }"#;

    let result: Result<UpdateTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when values is missing");
}

#[test]
fn test_update_template_data_extra_fields_ok() {
    let json = r#"{
        "id": "01900000-0000-7000-8000-000000000001",
        "values": {
            "title": "Updated Template",
            "content": {
                "fields": [
                    {"id": "01900000-0000-7000-8000-000000000001", "title": "Front", "type": "text", "isRequired": true}
                ],
                "layout": [
                    {"field": "01900000-0000-7000-8000-000000000001", "operation": "display"}
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
        "id": 1,
        "values": {
            "title": "Updated Template",
            "content": {
                "fields": [
                    {"id": "01900000-0000-7000-8000-000000000001", "title": "Front", "type": "text", "isRequired": true}
                ],
                "layout": [
                    {"field": "01900000-0000-7000-8000-000000000001", "operation": "display"}
                ]
            }
        }
    }"#;

    let result: Result<UpdateTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when id is a number");
}

#[test]
fn test_update_template_data_values_invalid_type() {
    let json = r#"{
        "id": "01900000-0000-7000-8000-000000000001",
        "values": "not-an-object"
    }"#;

    let result: Result<UpdateTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when values is a string");
}
