use koloda::domain::templates::{InsertTemplateData, Template, TemplateContent, TemplateField, TemplateLayoutItem};
use serde_json::json;

fn template_fixture() -> Template {
    Template {
        id: "01900000-0000-7000-8000-00000000000b".to_string(),
        title: "Basic".to_string(),
        content: TemplateContent {
            fields: vec![
                TemplateField {
                    id: "01900000-0000-7000-8000-000000000001".to_string(),
                    title: "Front".to_string(),
                    field_type: "text".to_string(),
                    is_required: true,
                },
                TemplateField {
                    id: "01900000-0000-7000-8000-000000000002".to_string(),
                    title: "Back".to_string(),
                    field_type: "markdown".to_string(),
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
        },
        is_locked: true,
        created_at: 1_699_999_000_000,
        updated_at: None,
    }
}

/// Pins the exact JSON the NAPI layer hands the renderer for a template row:
/// the field `type` key (not `fieldType`), `isRequired`/`isLocked` camelCase,
/// and timestamps as RFC 3339 strings.
#[test]
fn test_template_serializes_wire_shape() {
    let value = serde_json::to_value(template_fixture()).unwrap();

    assert_eq!(
        value,
        json!({
            "id": "01900000-0000-7000-8000-00000000000b",
            "title": "Basic",
            "content": {
                "fields": [
                    { "id": "01900000-0000-7000-8000-000000000001", "title": "Front", "type": "text", "isRequired": true },
                    { "id": "01900000-0000-7000-8000-000000000002", "title": "Back", "type": "markdown", "isRequired": false },
                ],
                "layout": [
                    { "field": "01900000-0000-7000-8000-000000000001", "operation": "display" },
                    { "field": "01900000-0000-7000-8000-000000000002", "operation": "reveal" },
                ],
            },
            "isLocked": true,
            "createdAt": "2023-11-14T21:56:40+00:00",
            "updatedAt": null,
        })
    );
}

#[test]
fn test_template_json_round_trips() {
    let value = serde_json::to_value(template_fixture()).unwrap();

    let back: Template = serde_json::from_value(value).unwrap();

    assert_eq!(back, template_fixture());
}

#[test]
fn test_insert_template_data_input_shapes() {
    let payload = json!({
        "title": "Basic",
        "content": {
            "fields": [{ "id": "01900000-0000-7000-8000-000000000001", "title": "Front", "type": "text", "isRequired": true }],
            "layout": [{ "field": "01900000-0000-7000-8000-000000000001", "operation": "display" }],
        },
    });

    // Serde accepts any field `type`/operation string — restricting to the
    // allowed sets is `validate()`'s job, not the wire's.
    let mut unknown_type = payload.clone();
    unknown_type["content"]["fields"][0]["type"] = json!("audio");
    serde_json::from_value::<InsertTemplateData>(unknown_type)
        .expect("serde must tolerate unknown types; validate() rejects them");

    for field in ["title", "content"] {
        let mut missing = payload.clone();
        missing.as_object_mut().unwrap().remove(field);
        assert!(
            serde_json::from_value::<InsertTemplateData>(missing).is_err(),
            "{field} is required"
        );
    }
}
