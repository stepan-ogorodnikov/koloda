//! Shared fixture shape for `conformance/*.json`. Input and output stay generic per suite.

use serde::de::DeserializeOwned;
use serde::Deserialize;

const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FixtureFile<I, O> {
    pub schema_version: u32,
    pub cases: Vec<FixtureCase<I, O>>,
}

#[derive(Debug, Deserialize)]
pub struct FixtureCase<I, O> {
    pub name: String,
    pub input: I,
    pub output: Option<O>,
    pub error: Option<String>,
}

pub fn load_fixture<I, O>(json: &str) -> FixtureFile<I, O>
where
    I: DeserializeOwned,
    O: DeserializeOwned,
{
    let file: FixtureFile<I, O> = serde_json::from_str(json).expect("fixture JSON should deserialize");
    assert_eq!(
        file.schema_version, SCHEMA_VERSION,
        "unsupported schemaVersion {} (expected {SCHEMA_VERSION})",
        file.schema_version
    );
    for case in &file.cases {
        let has_output = case.output.is_some();
        let has_error = case.error.is_some();
        assert!(
            has_output ^ has_error,
            "case {:?}: exactly one of output or error is required",
            case.name
        );
    }
    file
}

#[test]
#[should_panic(expected = "unsupported schemaVersion")]
fn rejects_unsupported_schema_version() {
    load_fixture::<serde_json::Value, serde_json::Value>(
        r#"{"schemaVersion": 2, "cases": [{"name": "x", "input": {}, "output": {}}]}"#,
    );
}

#[test]
#[should_panic(expected = "exactly one of output or error")]
fn rejects_case_with_both_output_and_error() {
    load_fixture::<serde_json::Value, serde_json::Value>(
        r#"{"schemaVersion": 1, "cases": [{"name": "both", "input": {}, "output": {}, "error": "x"}]}"#,
    );
}

#[test]
#[should_panic(expected = "exactly one of output or error")]
fn rejects_case_with_neither_output_nor_error() {
    load_fixture::<serde_json::Value, serde_json::Value>(
        r#"{"schemaVersion": 1, "cases": [{"name": "neither", "input": {}}]}"#,
    );
}
