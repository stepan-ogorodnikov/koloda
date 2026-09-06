use koloda_core::domain::algorithms::Algorithm;
use koloda_core::domain::algorithms_fsrs::AlgorithmFSRS;
use serde_json::json;

fn algorithm_fixture() -> Algorithm {
    Algorithm {
        id: 9,
        title: "FSRS".to_string(),
        content: AlgorithmFSRS {
            algorithm_type: "fsrs".to_string(),
            retention: 0.9,
            weights: "0.2172,1.1771".to_string(),
            is_fuzz_enabled: true,
            learning_steps: vec![(1, "m".to_string()), (10, "m".to_string())],
            relearning_steps: vec![(10, "m".to_string())],
            maximum_interval: 3650,
        },
        created_at: 1_699_999_000_000,
        updated_at: None,
    }
}

/// Pins the exact JSON the NAPI layer hands the renderer for an algorithm:
/// the FSRS content is a nested object whose `type` key comes from the
/// `algorithm_type` field, and learning steps are `[amount, unit]` pairs.
#[test]
fn test_algorithm_serializes_wire_shape() {
    let value = serde_json::to_value(algorithm_fixture()).unwrap();

    assert_eq!(
        value,
        json!({
            "id": 9,
            "title": "FSRS",
            "content": {
                "type": "fsrs",
                "retention": 0.9,
                "weights": "0.2172,1.1771",
                "isFuzzEnabled": true,
                "learningSteps": [[1, "m"], [10, "m"]],
                "relearningSteps": [[10, "m"]],
                "maximumInterval": 3650,
            },
            "createdAt": "2023-11-14T21:56:40+00:00",
            "updatedAt": null,
        })
    );
}

#[test]
fn test_algorithm_json_round_trips() {
    let value = serde_json::to_value(algorithm_fixture()).unwrap();

    let back: Algorithm = serde_json::from_value(value).unwrap();

    assert_eq!(back, algorithm_fixture());
}

#[test]
fn test_algorithm_content_input_shapes() {
    // `type` must be present and a string; steps are strict (i64, String) pairs.
    let mistyped = [
        json!({ "type": null, "retention": 0.9, "weights": "1", "isFuzzEnabled": true,
                "learningSteps": [], "relearningSteps": [], "maximumInterval": 1 }),
        json!({ "type": "fsrs", "retention": 0.9, "weights": "1", "isFuzzEnabled": true,
                "learningSteps": [["1", "m"]], "relearningSteps": [], "maximumInterval": 1 }),
        json!({ "type": "fsrs", "retention": 0.9, "weights": "1", "isFuzzEnabled": true,
                "learningSteps": [[1, true]], "relearningSteps": [], "maximumInterval": 1 }),
    ];

    for content in mistyped {
        assert!(
            serde_json::from_value::<AlgorithmFSRS>(content).is_err(),
            "mistyped FSRS content must reject"
        );
    }
}
