//! Learning-day `[from, to)` windows in local time — mirrors `@koloda/srs` `getLearningDayRangeAt`.
//!
//! Adjacent boundaries use the same wall-clock time on the adjacent calendar date (not ±86400s),
//! so a learning day may last 23, 24, or 25 elapsed hours across DST.
//! Must stay aligned with `settings_learning::parse_day_starts_at` (zero-padded `hh:mm`).

use chrono::{DateTime, Duration, Local, LocalResult, NaiveDateTime, NaiveTime, TimeZone};

use crate::app::error::AppError;
use crate::domain::settings_learning::parse_day_starts_at;

pub fn learning_day_range_at<Tz: TimeZone>(now: DateTime<Tz>, day_starts_at: &str) -> Result<(i64, i64), AppError> {
    // INVARIANT: must match TS `getLearningDayRangeAt` — `dayStartsAt` is local wall-clock
    // time and the window is `[from, to)`. Previous/next boundaries are the same clock time
    // on the adjacent calendar date (JS `setDate(getDate() ± 1)`).
    let (hours, minutes) = parse_day_starts_at(day_starts_at)?;

    // INVARIANT: `parse_day_starts_at` validates `0 <= hours <= 23` and `0 <= minutes <= 59`,
    // so `from_hms_opt` cannot return `None` for the parsed values.
    let boundary_time =
        NaiveTime::from_hms_opt(hours, minutes, 0).expect("parse_day_starts_at guarantees a valid time");

    let tz = now.timezone();
    let today = now.date_naive();
    let today_boundary = datetime_from_naive(&tz, today.and_time(boundary_time));
    // WHY: JS `setDate(getDate() ± 1)` copies the already-resolved wall-clock (so a
    // spring-forward `02:30` becomes `03:30` on both the gap day and the adjacent day).
    let boundary_date = today_boundary.date_naive();
    let resolved_time = today_boundary.time();

    let (from, to) = if now < today_boundary {
        let prev = boundary_date.pred_opt().expect("calendar date has a previous day");
        (datetime_from_naive(&tz, prev.and_time(resolved_time)), today_boundary)
    } else {
        let next = boundary_date.succ_opt().expect("calendar date has a next day");
        (today_boundary, datetime_from_naive(&tz, next.and_time(resolved_time)))
    };

    Ok((from.timestamp_millis(), to.timestamp_millis()))
}

pub fn current_learning_day_range(day_starts_at: &str) -> Result<(i64, i64), AppError> {
    learning_day_range_at(Local::now(), day_starts_at)
}

fn datetime_from_naive<Tz: TimeZone>(tz: &Tz, naive: NaiveDateTime) -> DateTime<Tz> {
    match tz.from_local_datetime(&naive) {
        LocalResult::Single(dt) => dt,
        // WORKAROUND: chrono returns two candidates on the fall-back hour; pick
        // earliest to match JS `new Date(...)` so desktop and web agree on which
        // local day a review belongs to.
        LocalResult::Ambiguous(earliest, _) => earliest,
        // INVARIANT: JS `new Date(y, m, d, h, min)` skips forward by the DST gap
        // (e.g. 02:30 → 03:30 on US spring-forward). A valid `dayStartsAt` must still resolve.
        LocalResult::None => datetime_after_dst_gap(tz, naive),
    }
}

fn datetime_after_dst_gap<Tz: TimeZone>(tz: &Tz, naive: NaiveDateTime) -> DateTime<Tz> {
    let gap = local_dst_gap(tz, naive);
    let shifted = naive
        .checked_add_signed(gap)
        .expect("datetime overflow after DST gap skip");
    match tz.from_local_datetime(&shifted) {
        LocalResult::Single(dt) => dt,
        LocalResult::Ambiguous(earliest, _) => earliest,
        LocalResult::None => first_valid_datetime_after(tz, shifted),
    }
}

fn local_dst_gap<Tz: TimeZone>(tz: &Tz, naive: NaiveDateTime) -> Duration {
    let gap_end = first_valid_naive_after(tz, naive);
    let gap_start = first_invalid_naive_at_or_before(tz, naive);
    gap_end.signed_duration_since(gap_start)
}

fn first_valid_naive_after<Tz: TimeZone>(tz: &Tz, start: NaiveDateTime) -> NaiveDateTime {
    let mut candidate = start;
    let mut found = None;
    for _ in 0..(24 * 60) {
        candidate = candidate
            .checked_add_signed(Duration::minutes(1))
            .expect("datetime overflow while locating DST gap end");
        if !matches!(tz.from_local_datetime(&candidate), LocalResult::None) {
            found = Some(candidate);
            break;
        }
    }
    found.expect("DST gap should be shorter than 24 hours")
}

fn first_invalid_naive_at_or_before<Tz: TimeZone>(tz: &Tz, naive: NaiveDateTime) -> NaiveDateTime {
    let mut start = naive;
    for _ in 0..(24 * 60) {
        let Some(prev) = start.checked_sub_signed(Duration::minutes(1)) else {
            break;
        };
        match tz.from_local_datetime(&prev) {
            LocalResult::None => start = prev,
            _ => break,
        }
    }
    start
}

fn first_valid_datetime_after<Tz: TimeZone>(tz: &Tz, start: NaiveDateTime) -> DateTime<Tz> {
    let mut candidate = start;
    let mut found = None;
    for _ in 0..(24 * 60) {
        candidate = candidate
            .checked_add_signed(Duration::minutes(1))
            .expect("datetime overflow while skipping DST gap");
        match tz.from_local_datetime(&candidate) {
            LocalResult::None => {}
            LocalResult::Single(dt) => {
                found = Some(dt);
                break;
            }
            LocalResult::Ambiguous(earliest, _) => {
                found = Some(earliest);
                break;
            }
        }
    }
    found.expect("DST gap should be shorter than 24 hours")
}
