//! Learning-day `[from, to)` windows in local time — mirrors `@koloda/srs` `getCurrentLearningDayRange`.
//!
//! Must stay aligned with `settings_learning::parse_day_starts_at` (zero-padded `hh:mm`).

use chrono::{DateTime, Duration, Local, LocalResult, NaiveTime, TimeZone};

use crate::app::error::{error_codes, AppError};
use crate::domain::settings_learning::parse_day_starts_at;

pub fn learning_day_range_at(now: DateTime<Local>, day_starts_at: &str) -> Result<(i64, i64), AppError> {
    // INVARIANT: must match TS `getCurrentLearningDayRange` — `dayStartsAt` is local
    // wall-clock time and the window is `[from, to)`.
    let (hours, minutes) = parse_day_starts_at(day_starts_at)?;

    // INVARIANT: `parse_day_starts_at` validates `0 <= hours <= 23` and `0 <= minutes <= 59`,
    // so `from_hms_opt` cannot return `None` for the parsed values.
    let boundary_time =
        NaiveTime::from_hms_opt(hours, minutes, 0).expect("parse_day_starts_at guarantees a valid time");

    let today_boundary = local_datetime_from_naive(now.date_naive().and_time(boundary_time))?;

    let (from, to) = if now < today_boundary {
        (today_boundary - Duration::days(1), today_boundary)
    } else {
        (today_boundary, today_boundary + Duration::days(1))
    };

    Ok((from.timestamp_millis(), to.timestamp_millis()))
}

pub fn current_learning_day_range(day_starts_at: &str) -> Result<(i64, i64), AppError> {
    learning_day_range_at(Local::now(), day_starts_at)
}

fn local_datetime_from_naive(naive: chrono::NaiveDateTime) -> Result<DateTime<Local>, AppError> {
    match Local.from_local_datetime(&naive) {
        LocalResult::Single(dt) => Ok(dt),
        // WORKAROUND: chrono returns two candidates on the fall-back hour; pick
        // earliest to match JS `new Date(...)` so desktop and web agree on which
        // local day a review belongs to.
        LocalResult::Ambiguous(earliest, _) => Ok(earliest),
        LocalResult::None => Err(AppError::new(
            error_codes::VALIDATION_SETTINGS_LEARNING_DAY_STARTS_AT,
            Some(format!("Local time does not exist: {naive}")),
        )),
    }
}
