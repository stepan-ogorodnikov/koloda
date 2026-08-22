mod common;

use koloda_core::domain::reviews::{calculate_todays_review_totals, ReviewTotals};
use koloda_core::domain::settings_learning::{CountedDailyLimit, DailyLimits};

// ============================================================================
// CALCULATE TODAYS REVIEW TOTALS
// ============================================================================

fn counted_limit(value: u32, counts: bool) -> CountedDailyLimit {
    CountedDailyLimit { value, counts }
}

fn daily_limits(
    total: u32,
    untouched: CountedDailyLimit,
    learn: CountedDailyLimit,
    review: CountedDailyLimit,
) -> DailyLimits {
    DailyLimits {
        total,
        untouched,
        learn,
        review,
    }
}

fn totals(untouched: i64, learn: i64, review: i64) -> ReviewTotals {
    ReviewTotals {
        untouched,
        learn,
        review,
        total: untouched + learn + review,
    }
}

#[test]
fn test_calculate_todays_review_totals_all_under_limit_flags_false() {
    let limits = daily_limits(
        100,
        counted_limit(20, true),
        counted_limit(30, true),
        counted_limit(50, true),
    );

    let result = calculate_todays_review_totals(totals(1, 2, 3), limits);

    assert_eq!(result.review_totals.total, 6);
    assert!(!result.meta.is_untouched_over_the_limit);
    assert!(!result.meta.is_learn_over_the_limit);
    assert!(!result.meta.is_review_over_the_limit);
    assert!(!result.meta.is_total_over_the_limit);
}

#[test]
fn test_calculate_todays_review_totals_returns_daily_limits_unchanged() {
    let limits = daily_limits(
        10,
        counted_limit(2, true),
        counted_limit(3, false),
        counted_limit(4, true),
    );

    let result = calculate_todays_review_totals(totals(0, 0, 0), limits);

    assert_eq!(result.daily_limits.total, 10);
    assert_eq!(result.daily_limits.untouched.value, 2);
    assert!(result.daily_limits.untouched.counts);
    assert_eq!(result.daily_limits.learn.value, 3);
    assert!(!result.daily_limits.learn.counts);
    assert_eq!(result.daily_limits.review.value, 4);
    assert!(result.daily_limits.review.counts);
}

#[test]
fn test_calculate_todays_review_totals_replaces_total_with_counted_buckets_only() {
    let limits = daily_limits(
        100,
        counted_limit(20, false),
        counted_limit(30, true),
        counted_limit(50, true),
    );

    let result = calculate_todays_review_totals(totals(7, 2, 3), limits);

    assert_eq!(result.review_totals.total, 5, "only counted types contribute to total");
}

#[test]
fn test_calculate_todays_review_totals_marks_bucket_over_own_limit() {
    let limits = daily_limits(
        100,
        counted_limit(1, true),
        counted_limit(50, true),
        counted_limit(50, true),
    );

    let result = calculate_todays_review_totals(totals(2, 0, 0), limits);

    assert!(
        result.meta.is_untouched_over_the_limit,
        "bucket above its own limit should be over"
    );
    assert!(!result.meta.is_learn_over_the_limit);
    assert!(!result.meta.is_review_over_the_limit);
    assert!(!result.meta.is_total_over_the_limit, "total is below its limit");
}

#[test]
fn test_calculate_todays_review_totals_bucket_at_exact_own_limit_not_over() {
    let limits = daily_limits(
        0,
        counted_limit(2, true),
        counted_limit(50, true),
        counted_limit(50, true),
    );

    let result = calculate_todays_review_totals(totals(2, 0, 0), limits);

    assert!(
        !result.meta.is_untouched_over_the_limit,
        "bucket exactly at its own limit should not be over (strictly-greater semantics)"
    );
    assert!(!result.meta.is_total_over_the_limit, "zero total limit is no cap");
}

#[test]
fn test_calculate_todays_review_totals_counted_bucket_over_shared_total() {
    let limits = daily_limits(
        3,
        counted_limit(10, true),
        counted_limit(10, true),
        counted_limit(10, true),
    );

    // Every bucket is under its own limit of 10, but the shared total is reached.
    let result = calculate_todays_review_totals(totals(1, 1, 1), limits);

    assert!(
        result.meta.is_untouched_over_the_limit && result.meta.is_learn_over_the_limit,
        "counted buckets should respect the total limit"
    );
    assert!(result.meta.is_review_over_the_limit);
    assert!(result.meta.is_total_over_the_limit, "total at the limit (`>=`) is over");
}

#[test]
fn test_calculate_todays_review_totals_non_counted_bucket_ignores_total_limit() {
    let limits = daily_limits(
        1,
        counted_limit(10, false),
        counted_limit(10, true),
        counted_limit(10, true),
    );

    // Untouched does not count toward total; only learn+review (2) reach the total.
    let result = calculate_todays_review_totals(totals(5, 1, 1), limits);

    assert_eq!(result.review_totals.total, 2);
    assert!(
        !result.meta.is_untouched_over_the_limit,
        "non-counted type should ignore the total limit"
    );
    assert!(result.meta.is_learn_over_the_limit);
    assert!(result.meta.is_review_over_the_limit);
}

#[test]
fn test_calculate_todays_review_totals_zero_total_limit_is_no_cap() {
    let limits = daily_limits(
        0,
        counted_limit(10, true),
        counted_limit(10, true),
        counted_limit(10, true),
    );

    let result = calculate_todays_review_totals(totals(5, 5, 5), limits);

    assert!(!result.meta.is_untouched_over_the_limit);
    assert!(!result.meta.is_learn_over_the_limit);
    assert!(!result.meta.is_review_over_the_limit);
    assert!(
        !result.meta.is_total_over_the_limit,
        "a daily limit of zero is no cap, not a hard zero"
    );
}

#[test]
fn test_calculate_todays_review_totals_zero_activity_never_over_the_limit() {
    let limits = daily_limits(
        1,
        counted_limit(0, true),
        counted_limit(0, true),
        counted_limit(0, true),
    );

    let result = calculate_todays_review_totals(totals(0, 0, 0), limits);

    assert_eq!(result.review_totals.total, 0);
    assert!(!result.meta.is_untouched_over_the_limit);
    assert!(!result.meta.is_learn_over_the_limit);
    assert!(!result.meta.is_review_over_the_limit);
    assert!(
        !result.meta.is_total_over_the_limit,
        "no activity should never be flagged over the limit"
    );
}
