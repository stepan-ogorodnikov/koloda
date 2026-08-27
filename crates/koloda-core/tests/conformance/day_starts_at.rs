//! Adapter for `conformance/day-starts-at.json` → `parse_day_starts_at`.

use crate::loader::load_fixture;
use koloda_core::domain::settings_learning::parse_day_starts_at;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DayStartsAtInput {
    day_starts_at: String,
}

#[derive(Debug, Deserialize)]
struct DayStartsAtOutput {
    hours: u32,
    minutes: u32,
}

#[test]
fn day_starts_at_goldens() {
    let fixture =
        load_fixture::<DayStartsAtInput, DayStartsAtOutput>(include_str!("../../../../conformance/day-starts-at.json"));

    for case in &fixture.cases {
        match (
            &case.output,
            &case.error,
            parse_day_starts_at(&case.input.day_starts_at),
        ) {
            (Some(expected), None, Ok((hours, minutes))) => {
                assert_eq!(hours, expected.hours, "case {:?}", case.name);
                assert_eq!(minutes, expected.minutes, "case {:?}", case.name);
            }
            (Some(_), None, Err(err)) => {
                panic!("case {:?}: expected success, got {}", case.name, err.code)
            }
            (None, Some(expected_code), Err(err)) => {
                assert_eq!(err.code, *expected_code, "case {:?}", case.name);
            }
            (None, Some(expected_code), Ok((hours, minutes))) => {
                panic!(
                    "case {:?}: expected error {expected_code}, got ({hours}, {minutes})",
                    case.name
                )
            }
            _ => unreachable!("loader rejects both and neither"),
        }
    }
}
