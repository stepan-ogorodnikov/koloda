use koloda::app::error::error_codes;
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

// Twin: "locked template update with $change is allowed: $isAllowed" in libs/srs/src/lib/templates.test.ts;
// the rows match.
#[test]
fn locked_template_keeps_every_field_with_its_type_and_required_flag() {
    type Edit = fn(&mut Vec<TemplateField>);
    let cases: [(&str, Edit, bool); 5] = [
        ("a field title", |fields| fields[0].title = "Prompt".to_string(), true),
        (
            "an added field",
            |fields| {
                fields.push(TemplateField {
                    id: "01900000-0000-7000-8000-000000000003".to_string(),
                    title: "Extra".to_string(),
                    field_type: "text".to_string(),
                    is_required: false,
                })
            },
            true,
        ),
        (
            "a removed field",
            |fields| {
                fields.remove(1);
            },
            false,
        ),
        (
            "a field type",
            |fields| fields[0].field_type = "text".to_string(),
            false,
        ),
        ("a required flag", |fields| fields[0].is_required = false, false),
    ];

    for (change, edit, is_allowed) in cases {
        let original = create_original_template_content();
        let mut content = original.clone();
        edit(&mut content.fields);
        content
            .layout
            .retain(|item| content.fields.iter().any(|field| field.id == item.field));
        let values = UpdateTemplateValues {
            title: "Updated Template".to_string(),
            content,
            notes: None,
        };

        let result = values.validate(Some(&original));

        if is_allowed {
            assert!(result.is_ok(), "{change} is allowed on a locked template");
        } else {
            let err = result.expect_err(change);
            assert_eq!(err.code, error_codes::VALIDATION_TEMPLATES_UPDATE_LOCKED, "{change}");
            assert_eq!(err.details, None, "{change}: the message alone explains the rejection");
        }
    }
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
