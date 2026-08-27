use chrono::{DateTime, Datelike, Local, TimeZone, Timelike, Utc};
use chrono_tz::{America::New_York, Tz};
use koloda_core::app::error::error_codes;
use koloda_core::domain::learning_day::learning_day_range_at;

const HOUR_MS: i64 = 60 * 60 * 1000;

fn local_datetime(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> chrono::DateTime<Local> {
    Local
        .with_ymd_and_hms(year, month, day, hour, minute, 0)
        .single()
        .expect("test datetime should be valid in local timezone")
}

fn ny_datetime(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> DateTime<Tz> {
    New_York
        .with_ymd_and_hms(year, month, day, hour, minute, 0)
        .single()
        .expect("test datetime should be valid in America/New_York")
}

fn ny_from_millis(ms: i64) -> DateTime<Tz> {
    New_York
        .timestamp_millis_opt(ms)
        .single()
        .expect("millis should convert to America/New_York")
}

fn ny_earliest(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> DateTime<Tz> {
    New_York
        .with_ymd_and_hms(year, month, day, hour, minute, 0)
        .earliest()
        .expect("test datetime should exist in America/New_York")
}

fn ny_ambiguous(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> (DateTime<Tz>, DateTime<Tz>) {
    let earliest = New_York
        .with_ymd_and_hms(year, month, day, hour, minute, 0)
        .earliest()
        .expect("repeated hour should have an earlier occurrence");
    let latest = New_York
        .with_ymd_and_hms(year, month, day, hour, minute, 0)
        .latest()
        .expect("repeated hour should have a later occurrence");
    (earliest, latest)
}

fn assert_ny_wall_clock(ms: i64, year: i32, month: u32, day: u32, hour: u32, minute: u32) {
    let dt = ny_from_millis(ms);
    assert_eq!(dt.year(), year);
    assert_eq!(dt.month(), month);
    assert_eq!(dt.day(), day);
    assert_eq!(dt.hour(), hour);
    assert_eq!(dt.minute(), minute);
}

fn assert_range_ms(from: i64, to: i64, expected_from: DateTime<Tz>, expected_to: DateTime<Tz>) {
    assert_eq!(from, expected_from.timestamp_millis());
    assert_eq!(to, expected_to.timestamp_millis());
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

#[test]
fn learning_day_range_spring_forward_before_boundary_is_23_hours() {
    // 2024-03-10 02:00 EST → 03:00 EDT. Window [03-09 05:00 EST, 03-10 05:00 EDT) spans the gap.
    let now = ny_datetime(2024, 3, 10, 4, 30);
    let (from, to) = learning_day_range_at(now, "05:00").expect("range should be valid");

    assert_range_ms(from, to, ny_datetime(2024, 3, 9, 5, 0), ny_datetime(2024, 3, 10, 5, 0));
    assert_ny_wall_clock(from, 2024, 3, 9, 5, 0);
    assert_ny_wall_clock(to, 2024, 3, 10, 5, 0);
    assert_eq!(to - from, 23 * HOUR_MS);
}

#[test]
fn learning_day_range_spring_forward_at_boundary_keeps_05_00() {
    let now = ny_datetime(2024, 3, 10, 5, 0);
    let (from, to) = learning_day_range_at(now, "05:00").expect("range should be valid");

    assert_range_ms(from, to, ny_datetime(2024, 3, 10, 5, 0), ny_datetime(2024, 3, 11, 5, 0));
    assert_ny_wall_clock(from, 2024, 3, 10, 5, 0);
    assert_ny_wall_clock(to, 2024, 3, 11, 5, 0);
    assert_eq!(to - from, 24 * HOUR_MS);
}

#[test]
fn learning_day_range_spring_forward_after_boundary_keeps_05_00() {
    let now = ny_datetime(2024, 3, 10, 6, 30);
    let (from, to) = learning_day_range_at(now, "05:00").expect("range should be valid");

    assert_range_ms(from, to, ny_datetime(2024, 3, 10, 5, 0), ny_datetime(2024, 3, 11, 5, 0));
    assert_ny_wall_clock(from, 2024, 3, 10, 5, 0);
    assert_ny_wall_clock(to, 2024, 3, 11, 5, 0);
}

#[test]
fn learning_day_range_spring_forward_morning_after_keeps_05_00() {
    let now = ny_datetime(2024, 3, 11, 4, 30);
    let (from, to) = learning_day_range_at(now, "05:00").expect("range should be valid");

    assert_range_ms(from, to, ny_datetime(2024, 3, 10, 5, 0), ny_datetime(2024, 3, 11, 5, 0));
    assert_ny_wall_clock(from, 2024, 3, 10, 5, 0);
    assert_ny_wall_clock(to, 2024, 3, 11, 5, 0);
}

#[test]
fn learning_day_range_fall_back_before_boundary_is_25_hours() {
    // 2024-11-03 02:00 EDT → 01:00 EST. Window [11-02 05:00 EDT, 11-03 05:00 EST) spans the overlap.
    let now = ny_datetime(2024, 11, 3, 4, 30);
    let (from, to) = learning_day_range_at(now, "05:00").expect("range should be valid");

    assert_range_ms(from, to, ny_datetime(2024, 11, 2, 5, 0), ny_datetime(2024, 11, 3, 5, 0));
    assert_ny_wall_clock(from, 2024, 11, 2, 5, 0);
    assert_ny_wall_clock(to, 2024, 11, 3, 5, 0);
    assert_eq!(to - from, 25 * HOUR_MS);
}

#[test]
fn learning_day_range_fall_back_after_boundary_keeps_05_00() {
    let now = ny_datetime(2024, 11, 3, 6, 30);
    let (from, to) = learning_day_range_at(now, "05:00").expect("range should be valid");

    assert_range_ms(from, to, ny_datetime(2024, 11, 3, 5, 0), ny_datetime(2024, 11, 4, 5, 0));
    assert_ny_wall_clock(from, 2024, 11, 3, 5, 0);
    assert_ny_wall_clock(to, 2024, 11, 4, 5, 0);
    assert_eq!(to - from, 24 * HOUR_MS);
}

#[test]
fn learning_day_range_skips_forward_when_boundary_in_spring_gap() {
    // 02:30 does not exist on 2024-03-10; JS/V8 resolves to 03:30 EDT.
    let now = ny_datetime(2024, 3, 10, 4, 0);
    let (from, to) = learning_day_range_at(now, "02:30").expect("missing hour should skip forward, not error");

    let expected_from = ny_datetime(2024, 3, 10, 3, 30);
    let expected_to = ny_datetime(2024, 3, 11, 3, 30);
    assert_range_ms(from, to, expected_from, expected_to);
    assert_ny_wall_clock(from, 2024, 3, 10, 3, 30);
    assert_ny_wall_clock(to, 2024, 3, 11, 3, 30);
}

#[test]
fn learning_day_range_adjacent_day_skips_forward_into_spring_gap() {
    let now = ny_datetime(2024, 3, 9, 4, 0);
    let (from, to) = learning_day_range_at(now, "02:30").expect("range should be valid");

    assert_range_ms(
        from,
        to,
        ny_datetime(2024, 3, 9, 2, 30),
        ny_datetime(2024, 3, 10, 3, 30),
    );
    assert_ny_wall_clock(from, 2024, 3, 9, 2, 30);
    assert_ny_wall_clock(to, 2024, 3, 10, 3, 30);
}

#[test]
fn learning_day_range_picks_earlier_occurrence_when_boundary_in_fall_overlap() {
    // US Eastern repeats 01:00–01:59 on 2024-11-03; pick the earlier (EDT) 01:30.
    let now = ny_datetime(2024, 11, 3, 3, 0);
    let (from, to) = learning_day_range_at(now, "01:30").expect("range should be valid");

    let expected_from = ny_earliest(2024, 11, 3, 1, 30);
    let expected_to = ny_datetime(2024, 11, 4, 1, 30);
    assert_range_ms(from, to, expected_from, expected_to);
    let expected_utc = Utc
        .with_ymd_and_hms(2024, 11, 3, 5, 30, 0)
        .single()
        .expect("UTC datetime should be valid");
    assert_eq!(expected_from.timestamp_millis(), expected_utc.timestamp_millis());
    assert_ny_wall_clock(from, 2024, 11, 3, 1, 30);
    assert_ny_wall_clock(to, 2024, 11, 4, 1, 30);
}

#[test]
fn learning_day_range_when_now_is_in_repeated_hour() {
    let (earlier, later) = ny_ambiguous(2024, 11, 3, 1, 30);

    let (from_earlier, to_earlier) = learning_day_range_at(earlier, "05:00").expect("range should be valid");
    let (from_later, to_later) = learning_day_range_at(later, "05:00").expect("range should be valid");

    let expected_from = ny_datetime(2024, 11, 2, 5, 0);
    let expected_to = ny_datetime(2024, 11, 3, 5, 0);
    assert_range_ms(from_earlier, to_earlier, expected_from, expected_to);
    assert_range_ms(from_later, to_later, expected_from, expected_to);
    assert_eq!(to_earlier - from_earlier, 25 * HOUR_MS);
}
