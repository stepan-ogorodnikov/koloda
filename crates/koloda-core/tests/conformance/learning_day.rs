//! Adapter for `conformance/learning-day.*.json` → `learning_day_range_at`.

use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, LocalResult, NaiveDateTime, TimeZone, Utc};
use chrono_tz::America::New_York;
use koloda_core::domain::learning_day::learning_day_range_at;
use serde::Deserialize;

use crate::loader::{load_fixture, FixtureCase};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LearningDayInput {
    now: String,
    day_starts_at: String,
}

#[derive(Debug, Deserialize)]
struct LearningDayOutput {
    from: i64,
    to: i64,
}

fn learning_day_fixture_paths() -> Vec<PathBuf> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../conformance");
    let mut paths: Vec<_> = fs::read_dir(&dir)
        .unwrap_or_else(|err| panic!("conformance dir {}: {err}", dir.display()))
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("learning-day.") && name.ends_with(".json"))
        })
        .collect();
    paths.sort();
    assert!(
        !paths.is_empty(),
        "expected at least one learning-day.*.json in {}",
        dir.display()
    );
    paths
}

fn parse_now<Tz: TimeZone>(now: &str, tz: Tz) -> DateTime<Tz> {
    if now.ends_with('Z') {
        DateTime::parse_from_rfc3339(now)
            .unwrap_or_else(|err| panic!("invalid now {now:?}: {err}"))
            .with_timezone(&tz)
    } else {
        let naive = NaiveDateTime::parse_from_str(now, "%Y-%m-%dT%H:%M:%S")
            .unwrap_or_else(|err| panic!("invalid now {now:?}: {err}"));
        match tz.from_local_datetime(&naive) {
            LocalResult::Single(dt) => dt,
            // WORKAROUND: chrono returns two candidates on the fall-back hour; pick
            // earliest to match JS `new Date(...)` so desktop and web agree on which
            // local day a review belongs to.
            LocalResult::Ambiguous(earliest, _) => earliest,
            LocalResult::None => panic!("nonexistent local now {now:?}"),
        }
    }
}

fn assert_learning_day_case<Tz: TimeZone>(tz: Tz, case: &FixtureCase<LearningDayInput, LearningDayOutput>) {
    let now = parse_now(&case.input.now, tz);
    match (
        &case.output,
        &case.error,
        learning_day_range_at(now, &case.input.day_starts_at),
    ) {
        (Some(expected), None, Ok((from, to))) => {
            assert_eq!(from, expected.from, "case {:?}", case.name);
            assert_eq!(to, expected.to, "case {:?}", case.name);
        }
        (Some(_), None, Err(err)) => {
            panic!("case {:?}: expected success, got {}", case.name, err.code)
        }
        (None, Some(expected_code), Err(err)) => {
            assert_eq!(err.code, *expected_code, "case {:?}", case.name);
        }
        (None, Some(expected_code), Ok((from, to))) => {
            panic!(
                "case {:?}: expected error {expected_code}, got ({from}, {to})",
                case.name
            )
        }
        _ => unreachable!("loader rejects both and neither"),
    }
}

#[test]
fn learning_day_goldens() {
    for path in learning_day_fixture_paths() {
        let json = fs::read_to_string(&path).unwrap_or_else(|err| panic!("{}: {err}", path.display()));
        let fixture = load_fixture::<LearningDayInput, LearningDayOutput>(&json);
        let time_zone = fixture
            .time_zone
            .as_deref()
            .unwrap_or_else(|| panic!("{}: learning-day fixture requires timeZone", path.display()));

        match time_zone {
            "UTC" => {
                for case in &fixture.cases {
                    assert_learning_day_case(Utc, case);
                }
            }
            "America/New_York" => {
                for case in &fixture.cases {
                    assert_learning_day_case(New_York, case);
                }
            }
            other => panic!("{}: unknown timeZone {other}", path.display()),
        }
    }
}
