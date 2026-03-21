use koloda_native_tauri::domain::reviews::GetReviewTotalsParams;
use koloda_native_tauri::domain::settings::SettingsName;
use koloda_native_tauri::repo::reviews;
use serde_json::json;

mod common;
use common::fixtures::{add_algorithm, add_card, add_deck, add_template, insert_review_row};
use common::{counted_daily_limit, learning_settings_with_day_start};
use common::test_db;

fn get_todays_timestamp() -> i64 {
    koloda_native_tauri::app::utility::get_current_timestamp().expect("timestamp should be available")
}

#[test]
fn get_review_totals_counts_states_and_ignores_ignored_rows() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let card_id = add_card(&db, deck_id, template_id, "question");

    db.with_conn(|conn| {
        conn.execute(
            r#"
            INSERT INTO reviews (card_id, rating, state, due_at, stability, difficulty,
                                scheduled_days, learning_steps, time, is_ignored, created_at)
            VALUES (?1, 3, 0, NULL, 1.0, 5.0, 0, 0, 10, 0, 1000)
            "#,
            rusqlite::params![card_id],
        )?;
        conn.execute(
            r#"
            INSERT INTO reviews (card_id, rating, state, due_at, stability, difficulty,
                                scheduled_days, learning_steps, time, is_ignored, created_at)
            VALUES (?1, 3, 1, NULL, 1.0, 5.0, 0, 0, 10, 0, 2000)
            "#,
            rusqlite::params![card_id],
        )?;
        conn.execute(
            r#"
            INSERT INTO reviews (card_id, rating, state, due_at, stability, difficulty,
                                scheduled_days, learning_steps, time, is_ignored, created_at)
            VALUES (?1, 3, 2, NULL, 1.0, 5.0, 0, 0, 10, 0, 3000)
            "#,
            rusqlite::params![card_id],
        )?;
        conn.execute(
            r#"
            INSERT INTO reviews (card_id, rating, state, due_at, stability, difficulty,
                                scheduled_days, learning_steps, time, is_ignored, created_at)
            VALUES (?1, 3, 2, NULL, 1.0, 5.0, 0, 0, 10, 1, 3500)
            "#,
            rusqlite::params![card_id],
        )?;
        Ok(())
    })
    .expect("review fixtures should be inserted");

    let totals = reviews::get_review_totals(&db, GetReviewTotalsParams { from: 1000, to: 4000 })
        .expect("review totals query should succeed");

    assert_eq!(totals.untouched, 1);
    assert_eq!(totals.learn, 1);
    assert_eq!(totals.review, 1);
    assert_eq!(totals.total, 3);
}

#[test]
fn get_todays_review_totals_uses_learning_day_window_and_limits_meta() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let card_id = add_card(&db, deck_id, template_id, "question");

    koloda_native_tauri::repo::settings::set_settings(
        &db,
        koloda_native_tauri::domain::settings::SettingsName::Learning,
        learning_settings_with_day_start(1, 1, 1, 1, "00:00"),
    )
    .expect("learning settings should be set");

    let now = get_todays_timestamp();
    let yesterday = now - 86_400_000;

    insert_review_row(&db, card_id, 0, 0, now);
    insert_review_row(&db, card_id, 2, 0, now);
    insert_review_row(&db, card_id, 1, 0, yesterday);

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
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let card_id = add_card(&db, deck_id, template_id, "question");

    koloda_native_tauri::repo::settings::set_settings(
        &db,
        SettingsName::Learning,
        json!({
            "defaults": {},
            "dailyLimits": {
                "total": 1,
                "untouched": counted_daily_limit(5, false),
                "learn": counted_daily_limit(5, true),
                "review": counted_daily_limit(5, true)
            },
            "dayStartsAt": "00:00",
            "learnAheadLimit": [4, 0],
        }),
    )
    .expect("learning settings should be set");

    let now = get_todays_timestamp();

    insert_review_row(&db, card_id, 0, 0, now);
    insert_review_row(&db, card_id, 1, 0, now);

    let totals = reviews::get_todays_review_totals(&db).expect("today totals should succeed");

    assert_eq!(totals.review_totals.untouched, 1);
    assert_eq!(totals.review_totals.learn, 1);
    assert_eq!(totals.review_totals.total, 1, "only counted types contribute to total");
    assert!(!totals.meta.is_untouched_over_the_limit, "non-counted type should ignore total limit");
    assert!(totals.meta.is_learn_over_the_limit, "counted type should still respect total limit");
    assert!(totals.meta.is_total_over_the_limit);
}

#[test]
fn get_review_totals_respects_from_inclusive_to_exclusive_range() {
    let db = test_db();
    let algorithm_id = add_algorithm(&db, "FSRS");
    let template_id = add_template(&db, "Basic");
    let deck_id = add_deck(&db, algorithm_id, template_id, "Deck");
    let card_id = add_card(&db, deck_id, template_id, "question");

    db.with_conn(|conn| {
        conn.execute(
            r#"
            INSERT INTO reviews (card_id, rating, state, due_at, stability, difficulty,
                                scheduled_days, learning_steps, time, is_ignored, created_at)
            VALUES (?1, 3, 0, NULL, 1.0, 5.0, 0, 0, 10, 0, 1000)
            "#,
            rusqlite::params![card_id],
        )?;
        conn.execute(
            r#"
            INSERT INTO reviews (card_id, rating, state, due_at, stability, difficulty,
                                scheduled_days, learning_steps, time, is_ignored, created_at)
            VALUES (?1, 3, 1, NULL, 1.0, 5.0, 0, 0, 10, 0, 1999)
            "#,
            rusqlite::params![card_id],
        )?;
        conn.execute(
            r#"
            INSERT INTO reviews (card_id, rating, state, due_at, stability, difficulty,
                                scheduled_days, learning_steps, time, is_ignored, created_at)
            VALUES (?1, 3, 2, NULL, 1.0, 5.0, 0, 0, 10, 0, 2000)
            "#,
            rusqlite::params![card_id],
        )?;
        Ok(())
    })
    .expect("review fixtures should be inserted");

    let totals = reviews::get_review_totals(&db, GetReviewTotalsParams { from: 1000, to: 2000 })
        .expect("review totals query should succeed");

    assert_eq!(totals.untouched, 1, "from is inclusive");
    assert_eq!(totals.learn, 1, "records before 'to' are included");
    assert_eq!(totals.review, 0, "record at 'to' is excluded");
    assert_eq!(totals.total, 2);
}
