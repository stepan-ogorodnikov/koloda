use koloda_native_tauri::app::error::error_codes;
use koloda_native_tauri::domain::templates::{
    DeleteTemplateData, TemplateContent, TemplateField, TemplateLayoutItem, UpdateTemplateData, UpdateTemplateValues,
};
use koloda_native_tauri::repo::templates;

mod common;
use common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use common::test_db;

#[test]
fn delete_template_fails_when_template_is_locked_by_cards() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let _ = add_card(&db, deck_id, template_id, "question");

    let err = templates::delete_template(
        &db,
        DeleteTemplateData {
            id: template_id,
            successor_id: None,
        },
    )
    .expect_err("locked template delete should fail");

    assert_eq!(err.code, error_codes::VALIDATION_TEMPLATES_DELETE_LOCKED);
}

#[test]
fn update_template_locked_rejects_field_type_and_required_changes() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let _ = add_card(&db, deck_id, template_id, "question");

    let original = templates::get_template(&db, template_id)
        .expect("template query should succeed")
        .expect("template should exist");

    let mut changed_type_fields = original.content.fields.clone();
    changed_type_fields[0].field_type = "markdown".to_string();

    let changed_type_result = templates::update_template(
        &db,
        UpdateTemplateData {
            id: template_id,
            values: UpdateTemplateValues {
                title: "Basic renamed".to_string(),
                content: TemplateContent {
                    fields: changed_type_fields,
                    layout: original.content.layout.clone(),
                },
            },
        },
    );
    assert!(
        changed_type_result.is_err(),
        "changing field type on locked template should fail"
    );
    assert_eq!(
        changed_type_result.expect_err("must fail").code,
        error_codes::VALIDATION_TEMPLATES_UPDATE_LOCKED
    );

    let mut changed_required_fields = original.content.fields.clone();
    changed_required_fields[0].is_required = !changed_required_fields[0].is_required;

    let changed_required_result = templates::update_template(
        &db,
        UpdateTemplateData {
            id: template_id,
            values: UpdateTemplateValues {
                title: "Basic renamed".to_string(),
                content: TemplateContent {
                    fields: changed_required_fields,
                    layout: original.content.layout.clone(),
                },
            },
        },
    );
    assert!(
        changed_required_result.is_err(),
        "changing required flag on locked template should fail"
    );
    assert_eq!(
        changed_required_result.expect_err("must fail").code,
        error_codes::VALIDATION_TEMPLATES_UPDATE_LOCKED
    );
}

#[test]
fn update_template_locked_allows_title_change_and_adding_new_field() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let _ = add_card(&db, deck_id, template_id, "question");

    let original = templates::get_template(&db, template_id)
        .expect("template query should succeed")
        .expect("template should exist");

    let mut fields = original.content.fields.clone();
    fields.push(TemplateField {
        id: 3,
        title: "Hint".to_string(),
        field_type: "text".to_string(),
        is_required: false,
    });
    let mut layout = original.content.layout.clone();
    layout.push(TemplateLayoutItem {
        field: 3,
        operation: "display".to_string(),
    });

    let updated = templates::update_template(
        &db,
        UpdateTemplateData {
            id: template_id,
            values: UpdateTemplateValues {
                title: "Basic v2".to_string(),
                content: TemplateContent { fields, layout },
            },
        },
    )
    .expect("locked template should allow title change and adding fields");

    assert_eq!(updated.title, "Basic v2");
    assert!(updated.content.fields.iter().any(|f| f.id == 3));
    assert!(updated.updated_at.is_some());
}

#[test]
fn update_template_locked_rejects_removing_existing_field() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let _ = add_card(&db, deck_id, template_id, "question");

    let original = templates::get_template(&db, template_id)
        .expect("template query should succeed")
        .expect("template should exist");

    let filtered_fields: Vec<TemplateField> = original
        .content
        .fields
        .clone()
        .into_iter()
        .filter(|f| f.id != 2)
        .collect();
    let filtered_layout: Vec<TemplateLayoutItem> = original
        .content
        .layout
        .clone()
        .into_iter()
        .filter(|item| item.field != 2)
        .collect();

    let result = templates::update_template(
        &db,
        UpdateTemplateData {
            id: template_id,
            values: UpdateTemplateValues {
                title: "Basic renamed".to_string(),
                content: TemplateContent {
                    fields: filtered_fields,
                    layout: filtered_layout,
                },
            },
        },
    );

    assert!(
        result.is_err(),
        "removing an existing field on locked template should fail"
    );
    assert_eq!(
        result.expect_err("must fail").code,
        error_codes::VALIDATION_TEMPLATES_UPDATE_LOCKED
    );
}
