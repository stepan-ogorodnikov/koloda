use koloda_core::domain::lessons::{GetLessonsParams, LessonAmounts, LessonDeck, LessonsResult};
use koloda_core::domain::lessons::{LessonTemplate, LessonTemplateLayoutItem};
use koloda_core::domain::templates::TemplateField;
use serde_json::json;

/// Pins the totals wire shape: per-type buckets and the deck rows nested flat.
#[test]
fn test_lessons_result_serializes_wire_shape() {
    let result = LessonsResult {
        total: LessonAmounts {
            untouched: 2,
            learn: 3,
            review: 5,
            total: 8,
        },
        decks: vec![LessonDeck {
            id: 5,
            title: "German".to_string(),
            untouched: 2,
            learn: 3,
            review: 5,
            total: 10,
        }],
    };

    let value = serde_json::to_value(&result).unwrap();

    assert_eq!(
        value,
        json!({
            "total": { "untouched": 2, "learn": 3, "review": 5, "total": 8 },
            "decks": [
                { "id": 5, "title": "German", "untouched": 2, "learn": 3, "review": 5, "total": 10 },
            ],
        })
    );

    let back: LessonsResult = serde_json::from_value(value).unwrap();
    assert_eq!(back, result);
}

/// Pins the lesson-template projection: layout items keep `fieldId` always and
/// `field` null when the referenced field is gone, and the row timestamps are
/// RFC 3339 strings.
#[test]
fn test_lesson_template_layout_allows_missing_field() {
    let template = LessonTemplate {
        id: 11,
        title: "Basic".to_string(),
        fields: vec![TemplateField {
            id: 1,
            title: "Front".to_string(),
            field_type: "text".to_string(),
            is_required: true,
        }],
        layout: vec![
            LessonTemplateLayoutItem {
                field: Some(TemplateField {
                    id: 1,
                    title: "Front".to_string(),
                    field_type: "text".to_string(),
                    is_required: true,
                }),
                operation: "display".to_string(),
                field_id: 1,
            },
            LessonTemplateLayoutItem {
                field: None,
                operation: "reveal".to_string(),
                field_id: 2,
            },
        ],
        created_at: 1_699_999_000_000,
        updated_at: None,
    };

    let value = serde_json::to_value(&template).unwrap();

    assert_eq!(
        value["layout"],
        json!([
            {
                "field": { "id": 1, "title": "Front", "type": "text", "isRequired": true },
                "operation": "display",
                "fieldId": 1,
            },
            { "field": null, "operation": "reveal", "fieldId": 2 },
        ])
    );
    assert_eq!(value["createdAt"], json!("2023-11-14T21:56:40+00:00"));

    let back: LessonTemplate = serde_json::from_value(value).unwrap();
    assert_eq!(back, template);
}

/// Pins the lesson-query input contract: `dueAt` accepts the ISO 8601 strings
/// the renderer sends (or a raw number), and `filters` may be absent — while
/// the lesson-data query requires `filters` and `amounts` outright.
#[test]
fn test_lesson_query_input_shapes() {
    let params: GetLessonsParams = serde_json::from_value(json!({
        "dueAt": "2023-11-14T22:13:20+00:00",
        "filters": { "deckIds": [5] },
    }))
    .expect("ISO 8601 dueAt should deserialize");
    assert_eq!(params.due_at, 1_700_000_000_000);
    assert_eq!(params.filters.unwrap().deck_ids, Some(vec![5]));

    let params: GetLessonsParams = serde_json::from_value(json!({ "dueAt": 1_700_000_000_000_i64 }))
        .expect("filters should be optional on get_lessons");
    assert_eq!(params.filters, None);

    for missing in ["filters", "amounts"] {
        let mut payload = json!({ "dueAt": 1_700_000_000_000_i64, "filters": {}, "amounts": {} });
        payload.as_object_mut().unwrap().remove(missing);
        assert!(
            serde_json::from_value::<koloda_core::domain::lessons::GetLessonDataParams>(payload).is_err(),
            "{missing} is required on get_lesson_data"
        );
    }
}
