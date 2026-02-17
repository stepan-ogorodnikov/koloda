use koloda_native_tauri::domain::templates::{
    CloneTemplateData, InsertTemplateData, TemplateContent, TemplateField, TemplateLayoutItem, UpdateTemplateData,
    UpdateTemplateValues,
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
    assert!(template.validate().is_ok());
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
    assert!(template.validate().is_ok());
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
    assert!(template.validate().is_ok());
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
    assert!(template.validate().is_ok());
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
    assert!(template.validate().is_ok());
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
    assert!(template.validate().is_ok());
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
    assert!(template.validate().is_ok());
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
    assert!(template.validate().is_ok());
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
    assert!(template.validate().is_ok());
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
