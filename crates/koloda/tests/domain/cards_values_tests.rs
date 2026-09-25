use crate::common::{
    empty_optional_field_content, empty_required_field_content, missing_optional_field_content,
    missing_required_field_content, valid_card_content, valid_template_fields,
};
use koloda::domain::cards::UpdateCardValues;
use serde_json::json;

#[test]
fn test_update_card_content_valid_ok() {
    let data = json!({
        "content": valid_card_content()
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    let values = result.unwrap();
    values.validate(&valid_template_fields()).unwrap();
}

#[test]
fn test_update_card_content_required_field_empty_fails() {
    let data = json!({
        "content": empty_required_field_content()
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    let values = result.unwrap();
    let validation_result = values.validate(&valid_template_fields());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards.content.field-empty"
    );
}

#[test]
fn test_update_card_content_required_field_missing_fails() {
    let data = json!({
        "content": missing_required_field_content()
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    let values = result.unwrap();
    let validation_result = values.validate(&valid_template_fields());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards.content.field-empty"
    );
}

#[test]
fn test_update_card_content_optional_field_empty_ok() {
    let data = json!({
        "content": empty_optional_field_content()
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    let values = result.unwrap();
    values.validate(&valid_template_fields()).unwrap();
}

#[test]
fn test_update_card_content_optional_field_missing_fails() {
    // Twin of `@koloda/srs` missing-optional-key test — CARDS.md requires every field present.
    let data = json!({
        "content": missing_optional_field_content()
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    let values = result.unwrap();
    let validation_result = values.validate(&valid_template_fields());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards.content.field-empty"
    );
}
