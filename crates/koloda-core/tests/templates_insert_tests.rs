mod common;

use koloda_core::domain::templates::InsertTemplateData;

// ============================================================================
// VALID TEMPLATE
// ============================================================================

#[test]
fn test_valid_template_passes() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "markdown", "isRequired": true},
                {"id": 2, "title": "Back", "type": "text", "isRequired": false}
            ],
            "layout": [
                {"field": 1, "operation": "display"},
                {"field": 2, "operation": "reveal"}
            ]
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize valid JSON");
    template.validate().unwrap();
}

// ============================================================================
// MISSING FIELDS
// ============================================================================

#[test]
fn test_empty_fields_fails() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [],
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    assert!(template.validate().is_err(), "Should fail with empty fields");
}

#[test]
fn test_empty_layout_items_fails() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": []
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    assert!(template.validate().is_err(), "Should fail with empty layout");
}

#[test]
fn test_empty_json_object_fails() {
    let json = r#"{}"#;

    let result: Result<InsertTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail with empty JSON");
}

#[test]
fn test_insert_template_missing_title() {
    let json = r#"{
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let result: Result<InsertTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when title is missing");
}

#[test]
fn test_insert_template_missing_content() {
    let json = r#"{
        "title": "Test Template"
    }"#;

    let result: Result<InsertTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when content is missing");
}

// ============================================================================
// EXTRA FIELDS
// ============================================================================

#[test]
fn test_template_with_extra_fields_ignored() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "display"}
            ],
            "extraField": "ignored"
        },
        "extraTopLevel": 123
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    template.validate().unwrap();
}

// ============================================================================
// TITLE FIELD
// ============================================================================

#[test]
fn test_title_empty_fails() {
    let json = r#"{
        "title": "",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    assert!(template.validate().is_err(), "Should fail with empty title");
}

#[test]
fn test_title_too_long_fails() {
    let json = format!(
        r#"{{
            "title": "{}",
            "content": {{
                "fields": [
                    {{"id": 1, "title": "Front", "type": "text", "isRequired": true}}
                ],
                "layout": [
                    {{"field": 1, "operation": "display"}}
                ]
            }}
        }}"#,
        "a".repeat(256)
    );

    let template: InsertTemplateData = serde_json::from_str(&json).expect("Should deserialize");
    assert!(template.validate().is_err(), "Should fail with title > 255 chars");
}

#[test]
fn test_title_unicode_ok() {
    let json = r#"{
        "title": "Шаблон карточки 🎴",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    template.validate().unwrap();
    assert_eq!(template.title, "Шаблон карточки 🎴");
}

#[test]
fn test_title_as_number_fails() {
    let json = r#"{
        "title": 123,
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let result: Result<InsertTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when title is a number");
}

// ============================================================================
// FIELD TYPE
// ============================================================================

#[test]
fn test_field_type_text_ok() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    template.validate().unwrap();
}

#[test]
fn test_field_type_markdown_ok() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "markdown", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    template.validate().unwrap();
}

#[test]
fn test_field_type_invalid_fails() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "invalid", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    assert!(template.validate().is_err(), "Should fail with invalid field type");
}

#[test]
fn test_field_type_empty_fails() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    assert!(template.validate().is_err(), "Should fail with empty field type");
}

// ============================================================================
// LAYOUT OPERATION
// ============================================================================

#[test]
fn test_layout_operation_display_ok() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    template.validate().unwrap();
}

#[test]
fn test_layout_operation_reveal_ok() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "reveal"}
            ]
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    template.validate().unwrap();
}

#[test]
fn test_layout_operation_type_ok() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "type"}
            ]
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    template.validate().unwrap();
}

#[test]
fn test_layout_operation_invalid_fails() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "invalid"}
            ]
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    assert!(template.validate().is_err(), "Should fail with invalid operation");
}

// ============================================================================
// LAYOUT FIELD REFERENCE
// ============================================================================

#[test]
fn test_layout_references_nonexistent_field_fails() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": 999, "operation": "display"}
            ]
        }
    }"#;

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    assert!(
        template.validate().is_err(),
        "Should fail when layout references nonexistent field"
    );
}

#[test]
fn test_layout_references_valid_field_ok() {
    let json = r#"{
        "title": "Test Template",
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

    let template: InsertTemplateData = serde_json::from_str(json).expect("Should deserialize");
    template.validate().unwrap();
}

// ============================================================================
// INVALID TYPE
// ============================================================================

#[test]
fn test_fields_as_object_fails() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": {"id": 1, "title": "Front", "type": "text", "isRequired": true},
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let result: Result<InsertTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when fields is an object instead of array");
}

#[test]
fn test_fields_as_string_fails() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": "invalid",
            "layout": []
        }
    }"#;

    let result: Result<InsertTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when fields is a string");
}

#[test]
fn test_layout_as_object_fails() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": {"field": 1, "operation": "display"}
        }
    }"#;

    let result: Result<InsertTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when layout is an object instead of array");
}

#[test]
fn test_field_id_as_string_fails() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": "1", "title": "Front", "type": "text", "isRequired": true}
            ],
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let result: Result<InsertTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when field id is a string");
}

#[test]
fn test_is_required_as_string_fails() {
    let json = r#"{
        "title": "Test Template",
        "content": {
            "fields": [
                {"id": 1, "title": "Front", "type": "text", "isRequired": "true"}
            ],
            "layout": [
                {"field": 1, "operation": "display"}
            ]
        }
    }"#;

    let result: Result<InsertTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when isRequired is a string");
}

#[test]
fn test_content_as_string_fails() {
    let json = r#"{
        "title": "Test Template",
        "content": "not-an-object"
    }"#;

    let result: Result<InsertTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when content is a string");
}

#[test]
fn test_content_as_number_fails() {
    let json = r#"{
        "title": "Test Template",
        "content": 123
    }"#;

    let result: Result<InsertTemplateData, _> = serde_json::from_str(json);
    assert!(result.is_err(), "Should fail when content is a number");
}
