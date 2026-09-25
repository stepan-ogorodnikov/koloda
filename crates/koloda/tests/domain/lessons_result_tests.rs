use crate::common::{valid_card_progress_json, valid_review_json};
use koloda::domain::lessons::LessonResultData;
use serde_json::json;

#[test]
fn test_lesson_result_missing_card() {
    let data = json!({
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap_err();
}

#[test]
fn test_lesson_result_missing_review() {
    let data = json!({
        "card": valid_card_progress_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap_err();
}

#[test]
fn test_lesson_result_extra_fields_ok() {
    let data = json!({
        "card": valid_card_progress_json(),
        "review": valid_review_json(),
        "unknownField": "ignored"
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap();
}

#[test]
fn test_lesson_result_card_invalid_type() {
    let data = json!({
        "card": "not-an-object",
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap_err();
}

#[test]
fn test_lesson_result_review_invalid_type() {
    let data = json!({
        "card": valid_card_progress_json(),
        "review": "not-an-object"
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap_err();
}

#[test]
fn test_lesson_result_valid() {
    let data = json!({
        "card": valid_card_progress_json(),
        "review": valid_review_json()
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_lesson_result_card_review_id_mismatch_fails() {
    // Both entities are individually valid; only their id link is broken.
    // The mismatch rule must fire even when neither side has a validation
    // error of its own.
    let mut card = valid_card_progress_json();
    card["id"] = json!("01900000-0000-7000-8000-000000000007");
    let mut review = valid_review_json();
    review["cardId"] = json!("01900000-0000-7000-8000-000000000008");

    let data = json!({
        "card": card,
        "review": review
    });
    let result = serde_json::from_value::<LessonResultData>(data);
    let err = result.unwrap().validate().unwrap_err();
    assert_eq!(err.code, "validation.lessons.result.card-review-mismatch");
}
