use koloda::domain::decks::InsertDeckData;
use serde_json::json;

fn insert_data(title: &str) -> InsertDeckData {
    serde_json::from_value(json!({
        "title": title,
        "algorithmId": "01900000-0000-7000-8000-000000000001",
        "templateId": "01900000-0000-7000-8000-000000000001"
    }))
    .expect("Should deserialize deck insert data")
}

#[test]
fn test_insert_deck_title_rules() {
    // WHY: the limit counts UTF-16 units, as the TS zod mirror does. 255 Cyrillic chars are
    // 510 UTF-8 bytes, so byte counting would reject them; 128 emoji are 256 UTF-16 units
    // (2 per astral char), so char counting would accept them.
    let cases: &[(&str, String, Option<&str>)] = &[
        ("empty", String::new(), Some("validation.common.title.too-short")),
        (
            "whitespace only",
            "   ".to_string(),
            Some("validation.common.title.too-short"),
        ),
        ("255 ASCII chars", "a".repeat(255), None),
        ("255 Cyrillic chars", "ф".repeat(255), None),
        ("128 emoji", "🦀".repeat(128), Some("validation.common.title.too-long")),
        (
            "256 Cyrillic chars",
            "ф".repeat(256),
            Some("validation.common.title.too-long"),
        ),
    ];

    for (name, title, expected_code) in cases {
        let observed = insert_data(title).validate().err().map(|error| error.code);
        assert_eq!(observed.as_deref(), *expected_code, "{name} title");
    }
}
