use koloda::app::error::error_codes;
use koloda::domain::cards::UpdateCardProgress;
use koloda::domain::lessons::LessonResultData;
use koloda::domain::reviews::{GetReviewTotalsParams, GetReviewsData, InsertReviewData, Review};
use koloda::domain::settings::SettingsName;
use koloda::repo::{lessons, reviews};
use serde_json::json;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template, insert_review_row};
use crate::common::test_db;
use crate::common::{counted_daily_limit, learning_settings_with_day_start, valid_learning_defaults};

fn get_todays_timestamp() -> i64 {
    koloda::app::utility::get_current_timestamp().expect("timestamp should be available")
}

#[test]
fn submit_lesson_result_round_trips_every_review_field() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, &algorithm_id, &template_id, "Deck");
    let card_id = add_card(&db, &deck_id, &template_id, "question");

    // WHY: no two columns share a value, so a swap in `insert_review` or the row mapper fails the comparison.
    lessons::submit_lesson_result(
        &db,
        LessonResultData {
            card: UpdateCardProgress {
                id: card_id.clone(),
                state: 2,
                due_at: 1_910_000_000_000,
                stability: 4.75,
                difficulty: 6.25,
                scheduled_days: 9,
                learning_steps: 6,
                reps: 1,
                lapses: 0,
                last_reviewed_at: Some(1_800_000_000_000),
            },
            review: InsertReviewData {
                card_id: card_id.clone(),
                rating: 3,
                state: 2,
                due_at: 1_910_000_000_000,
                stability: 4.75,
                difficulty: 6.25,
                scheduled_days: 9,
                learning_steps: 6,
                time: 17,
                is_ignored: true,
            },
        },
    )
    .expect("lesson result should be persisted");
    let stored = reviews::get_reviews(
        &db,
        GetReviewsData {
            card_id: card_id.clone(),
        },
    )
    .expect("reviews query should succeed");

    assert_eq!(stored.len(), 1);
    assert!(stored[0].created_at > 0, "created_at is stamped at insert");
    assert_eq!(
        stored[0],
        Review {
            id: stored[0].id.clone(),
            card_id,
            rating: 3,
            state: 2,
            due_at: 1_910_000_000_000,
            stability: 4.75,
            difficulty: 6.25,
            scheduled_days: 9,
            learning_steps: 6,
            time: 17,
            is_ignored: true,
            created_at: stored[0].created_at,
        }
    );
}

#[test]
fn get_review_totals_counts_states_and_ignores_ignored_rows() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, &algorithm_id, &template_id, "Deck");
    let card_id = add_card(&db, &deck_id, &template_id, "question");

    insert_review_row(&db, &card_id, 0, 0, 1000);
    insert_review_row(&db, &card_id, 1, 0, 2000);
    insert_review_row(&db, &card_id, 2, 0, 3000);
    insert_review_row(&db, &card_id, 2, 1, 3500);
    insert_review_row(&db, &card_id, 3, 0, 3800);

    let totals = reviews::get_review_totals(&db, GetReviewTotalsParams { from: 1000, to: 4000 })
        .expect("review totals query should succeed");

    assert_eq!(totals.untouched, 1);
    assert_eq!(totals.learn, 2, "relearning counts as learn");
    assert_eq!(totals.review, 1);
    assert_eq!(totals.total, 4);
}

#[test]
fn get_todays_review_totals_uses_learning_day_window_and_limits_meta() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, &algorithm_id, &template_id, "Deck");
    let card_id = add_card(&db, &deck_id, &template_id, "question");

    koloda::repo::settings::set_settings(
        &db,
        koloda::domain::settings::SettingsName::Learning,
        learning_settings_with_day_start(1, 1, 1, 1, "00:00"),
    )
    .expect("learning settings should be set");

    let now = get_todays_timestamp();
    let yesterday = now - 86_400_000;

    insert_review_row(&db, &card_id, 0, 0, now);
    insert_review_row(&db, &card_id, 2, 0, now);
    insert_review_row(&db, &card_id, 1, 0, yesterday);

    let totals = reviews::get_todays_review_totals(&db).expect("today totals should succeed");

    assert_eq!(totals.review_totals.untouched, 1);
    assert_eq!(totals.review_totals.review, 1);
    assert_eq!(totals.review_totals.learn, 0);
    assert_eq!(totals.review_totals.total, 2);
    assert!(totals.meta.is_total_over_the_limit);
    assert!(totals.meta.is_untouched_over_the_limit);
    assert!(totals.meta.is_review_over_the_limit);
}

#[test]
fn get_todays_review_totals_excludes_non_counted_limits_from_total() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, &algorithm_id, &template_id, "Deck");
    let card_id = add_card(&db, &deck_id, &template_id, "question");

    koloda::repo::settings::set_settings(
        &db,
        SettingsName::Learning,
        json!({
            "defaults": valid_learning_defaults(),
            "dailyLimits": {
                "total": 1,
                "untouched": counted_daily_limit(5, false),
                "learn": counted_daily_limit(1, true),
                "review": counted_daily_limit(1, true)
            },
            "dayStartsAt": "00:00",
            "learnAheadLimit": [4, 0],
        }),
    )
    .expect("learning settings should be set");

    let now = get_todays_timestamp();

    insert_review_row(&db, &card_id, 0, 0, now);
    insert_review_row(&db, &card_id, 1, 0, now);

    let totals = reviews::get_todays_review_totals(&db).expect("today totals should succeed");

    assert_eq!(totals.review_totals.untouched, 1);
    assert_eq!(totals.review_totals.learn, 1);
    assert_eq!(totals.review_totals.total, 1, "only counted types contribute to total");
    assert!(
        !totals.meta.is_untouched_over_the_limit,
        "non-counted type should ignore total limit"
    );
    assert!(
        totals.meta.is_learn_over_the_limit,
        "counted type should still respect total limit"
    );
    assert!(totals.meta.is_total_over_the_limit);
}

#[test]
fn get_review_totals_respects_from_inclusive_to_exclusive_range() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, &algorithm_id, &template_id, "Deck");
    let card_id = add_card(&db, &deck_id, &template_id, "question");

    insert_review_row(&db, &card_id, 0, 0, 1000);
    insert_review_row(&db, &card_id, 1, 0, 1999);
    insert_review_row(&db, &card_id, 2, 0, 2000);

    let totals = reviews::get_review_totals(&db, GetReviewTotalsParams { from: 1000, to: 2000 })
        .expect("review totals query should succeed");

    assert_eq!(totals.untouched, 1, "from is inclusive");
    assert_eq!(totals.learn, 1, "records before 'to' are included");
    assert_eq!(totals.review, 0, "record at 'to' is excluded");
    assert_eq!(totals.total, 2);
}

#[test]
fn get_todays_review_totals_fails_with_db_get_when_learning_settings_are_absent() {
    let db = test_db();

    let err = reviews::get_todays_review_totals(&db).expect_err("today's totals without learning settings should fail");

    assert_eq!(err.code, error_codes::DB_GET);
}

#[test]
fn get_review_totals_counts_reviews_created_in_window_even_when_due_after_to() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, &algorithm_id, &template_id, "Deck");
    let card_id = add_card(&db, &deck_id, &template_id, "question");

    insert_review_row(&db, &card_id, 1, 0, 2000);
    insert_review_row(&db, &card_id, 2, 0, 3000);

    let totals = reviews::get_review_totals(&db, GetReviewTotalsParams { from: 1000, to: 4000 })
        .expect("review totals query should succeed");

    assert_eq!(totals.learn, 1);
    assert_eq!(totals.review, 1);
    assert_eq!(totals.total, 2);
}
