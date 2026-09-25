use crate::common::{valid_card_progress_json, valid_review_json};
use koloda::domain::lessons::LessonResultData;
use serde_json::{json, Value};

/// Canonical valid lesson-result payload used as the mutation base for validation cases.
fn valid_payload() -> Value {
    json!({
        "card": valid_card_progress_json(),
        "review": valid_review_json(),
    })
}

// WHY: Several former zero-ok cases patched fields whose asserted value already equals
// this baseline (learningSteps/reps/lapses/time), so the unmutated payload subsumes them.
#[test]
fn test_lesson_result_valid_payload_passes() {
    serde_json::from_value::<LessonResultData>(valid_payload())
        .expect("canonical payload should deserialize")
        .validate()
        .unwrap();
}
