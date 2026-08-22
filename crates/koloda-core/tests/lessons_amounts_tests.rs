mod common;

use koloda_core::app::error::error_codes;
use koloda_core::domain::lessons::{GetLessonDataParams, LessonAmounts, LessonFilters};

// ============================================================================
// LESSON AMOUNTS VALIDATION
// ============================================================================

#[test]
fn lesson_amounts_zero_ok() {
    let amounts = LessonAmounts {
        untouched: 0,
        learn: 0,
        review: 0,
        total: 0,
    };
    amounts.validate().unwrap();
}

#[test]
fn lesson_amounts_negative_untouched_fails() {
    let amounts = LessonAmounts {
        untouched: -1,
        learn: 0,
        review: 0,
        total: 0,
    };
    let result = amounts.validate();
    assert_eq!(
        result.unwrap_err().code,
        error_codes::VALIDATION_LESSONS_AMOUNTS_NEGATIVE
    );
}

#[test]
fn lesson_amounts_negative_learn_fails() {
    let amounts = LessonAmounts {
        untouched: 0,
        learn: -1,
        review: 0,
        total: 0,
    };
    let result = amounts.validate();
    assert_eq!(
        result.unwrap_err().code,
        error_codes::VALIDATION_LESSONS_AMOUNTS_NEGATIVE
    );
}

#[test]
fn lesson_amounts_negative_review_fails() {
    let amounts = LessonAmounts {
        untouched: 0,
        learn: 0,
        review: -1,
        total: 0,
    };
    let result = amounts.validate();
    assert_eq!(
        result.unwrap_err().code,
        error_codes::VALIDATION_LESSONS_AMOUNTS_NEGATIVE
    );
}

#[test]
fn get_lesson_data_params_rejects_negative_amounts() {
    let params = GetLessonDataParams {
        due_at: 1_000,
        filters: LessonFilters::default(),
        amounts: LessonAmounts {
            untouched: -1,
            learn: 0,
            review: 0,
            total: 0,
        },
    };
    let result = params.validate();
    assert_eq!(
        result.unwrap_err().code,
        error_codes::VALIDATION_LESSONS_AMOUNTS_NEGATIVE
    );
}
