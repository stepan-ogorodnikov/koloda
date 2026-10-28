use koloda::app::error::error_codes;
use koloda::domain::templates::InsertTemplateData;
use serde_json::{json, Value};

const FRONT_ID: &str = "01900000-0000-7000-8000-000000000001";
const BACK_ID: &str = "01900000-0000-7000-8000-000000000002";

/// Canonical valid insert-template payload used as the mutation base for validation cases.
fn valid_payload() -> Value {
    json!({
        "title": "Test Template",
        "content": {
            "fields": [
                { "id": FRONT_ID, "title": "Front", "type": "text", "isRequired": true },
                { "id": BACK_ID, "title": "Back", "type": "markdown", "isRequired": false },
            ],
            "layout": [
                { "field": FRONT_ID, "operation": "display" },
                { "field": BACK_ID, "operation": "reveal" },
            ],
        },
    })
}

fn validation_code(payload: Value) -> Option<String> {
    serde_json::from_value::<InsertTemplateData>(payload)
        .expect("patched payload should still deserialize")
        .validate()
        .err()
        .map(|error| error.code)
}

#[test]
fn test_valid_template_passes() {
    assert_eq!(validation_code(valid_payload()), None);
}

#[test]
fn test_every_field_type_and_operation_passes() {
    for field_type in ["text", "markdown"] {
        let mut payload = valid_payload();
        payload["content"]["fields"][0]["type"] = json!(field_type);
        let observed = validation_code(payload);
        assert!(
            observed.is_none(),
            "field type {field_type} must pass, got {observed:?}"
        );
    }

    for operation in ["display", "reveal", "type"] {
        let mut payload = valid_payload();
        payload["content"]["layout"][0]["operation"] = json!(operation);
        let observed = validation_code(payload);
        assert!(observed.is_none(), "operation {operation} must pass, got {observed:?}");
    }
}

#[test]
fn test_invalid_template_fails_with_its_code() {
    // Twins: the TS "rejects ..." cases in libs/srs/src/lib/templates.test.ts assert the same content codes.
    // The title rules themselves live in decks_title_tests.rs; one row shows templates apply them.
    // WHY: each row breaks one rule while the others hold. "no fields" keeps layout items that point at the
    // removed fields, so it reports its own code only while the too-few check runs before layout membership.
    // The id rows pin the shape-before-value order that matches zod's issue order.
    type Patch = fn(&mut Value);
    let cases: [(&str, Patch, &str); 11] = [
        (
            "empty title",
            |payload| payload["title"] = json!(""),
            error_codes::VALIDATION_COMMON_TITLE_TOO_SHORT,
        ),
        (
            "no fields",
            |payload| payload["content"]["fields"] = json!([]),
            error_codes::VALIDATION_TEMPLATES_FIELDS_TOO_FEW,
        ),
        (
            "no layout items",
            |payload| payload["content"]["layout"] = json!([]),
            error_codes::VALIDATION_TEMPLATES_LAYOUT_TOO_FEW,
        ),
        (
            "non-uuid field id",
            |payload| {
                payload["content"]["fields"][0]["id"] = json!("not-a-uuid");
                payload["content"]["layout"][0]["field"] = json!("not-a-uuid");
            },
            error_codes::VALIDATION_TEMPLATES_FIELDS_ID,
        ),
        (
            "unsupported field type",
            |payload| payload["content"]["fields"][0]["type"] = json!("html"),
            error_codes::VALIDATION_TEMPLATES_FIELDS_TYPE,
        ),
        (
            "empty field type",
            |payload| payload["content"]["fields"][0]["type"] = json!(""),
            error_codes::VALIDATION_TEMPLATES_FIELDS_TYPE,
        ),
        (
            "non-uuid layout field",
            |payload| payload["content"]["layout"][0]["field"] = json!("01900000000070008000000000000001"),
            error_codes::VALIDATION_TEMPLATES_LAYOUT_FIELD,
        ),
        (
            "unsupported operation",
            |payload| payload["content"]["layout"][0]["operation"] = json!("hide"),
            error_codes::VALIDATION_TEMPLATES_LAYOUT_OPERATION,
        ),
        (
            "duplicate field id",
            |payload| payload["content"]["fields"][1]["id"] = json!(FRONT_ID),
            error_codes::VALIDATION_TEMPLATES_FIELDS_DUPLICATE_ID,
        ),
        (
            "two layout items for one field",
            |payload| payload["content"]["layout"][1]["field"] = json!(FRONT_ID),
            error_codes::VALIDATION_TEMPLATES_LAYOUT_DUPLICATE_FIELD,
        ),
        (
            "layout item for a missing field",
            |payload| payload["content"]["layout"][0]["field"] = json!("01900000-0000-7000-8000-0000000003e7"),
            error_codes::VALIDATION_TEMPLATES_LAYOUT_MISSING_FIELD,
        ),
    ];

    for (case, patch, code) in cases {
        let mut payload = valid_payload();
        patch(&mut payload);
        assert_eq!(
            validation_code(payload).as_deref(),
            Some(code),
            "{case} must surface {code}"
        );
    }
}
