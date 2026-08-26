use chrono::{Local, TimeZone};
use koloda_core::app::error::error_codes;
use koloda_core::domain::learning_day::learning_day_range_at;

fn local_datetime(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> chrono::DateTime<Local> {
    Local
        .with_ymd_and_hms(year, month, day, hour, minute, 0)
        .single()
        .expect("test datetime should be valid in local timezone")
}

#[test]
fn learning_day_range_returns_previous_day_when_before_boundary() {
    let now = local_datetime(2024, 1, 2, 4, 30);
    let (from, to) = learning_day_range_at(now, "05:00").expect("range should be valid");

    let expected_from = local_datetime(2024, 1, 1, 5, 0).timestamp_millis();
    let expected_to = local_datetime(2024, 1, 2, 5, 0).timestamp_millis();

    assert_eq!(from, expected_from);
    assert_eq!(to, expected_to);
}

#[test]
fn learning_day_range_returns_current_day_when_after_boundary() {
    let now = local_datetime(2024, 1, 2, 6, 30);
    let (from, to) = learning_day_range_at(now, "05:00").expect("range should be valid");

    let expected_from = local_datetime(2024, 1, 2, 5, 0).timestamp_millis();
    let expected_to = local_datetime(2024, 1, 3, 5, 0).timestamp_millis();

    assert_eq!(from, expected_from);
    assert_eq!(to, expected_to);
}

#[test]
fn learning_day_range_at_exact_boundary_is_inclusive_lower_bound() {
    let now = local_datetime(2024, 1, 2, 5, 0);
    let (from, to) = learning_day_range_at(now, "05:00").expect("range should be valid");

    let expected_from = local_datetime(2024, 1, 2, 5, 0).timestamp_millis();
    let expected_to = local_datetime(2024, 1, 3, 5, 0).timestamp_millis();

    assert_eq!(from, expected_from);
    assert_eq!(to, expected_to);
}

#[test]
fn learning_day_range_rejects_unpadded_hours() {
    let now = local_datetime(2024, 1, 2, 6, 30);
    let result = learning_day_range_at(now, "5:00");

    assert_eq!(
        result.expect_err("unpadded hours should fail").code,
        error_codes::VALIDATION_SETTINGS_LEARNING_DAY_STARTS_AT
    );
}

#[test]
fn learning_day_range_rejects_invalid_boundary() {
    let now = local_datetime(2024, 1, 2, 6, 30);
    let result = learning_day_range_at(now, "25:00");

    assert_eq!(
        result.expect_err("invalid boundary should fail").code,
        error_codes::VALIDATION_SETTINGS_LEARNING_DAY_STARTS_AT
    );
}

#[test]
fn learning_day_range_at_midnight_boundary() {
    let now = local_datetime(2024, 6, 15, 12, 0);
    let (from, to) = learning_day_range_at(now, "00:00").expect("range should be valid");

    let expected_from = local_datetime(2024, 6, 15, 0, 0).timestamp_millis();
    let expected_to = local_datetime(2024, 6, 16, 0, 0).timestamp_millis();

    assert_eq!(from, expected_from);
    assert_eq!(to, expected_to);
}
