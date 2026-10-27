use koloda::domain::algorithms_fsrs::AlgorithmFSRS;
use koloda::domain::cards::CardState;
use koloda::domain::optimizer::{
    new_progress, optimize, request_abort, FitScores, OptimizationInput, OptimizationOutcome, ReviewRecord,
};
use serde_json::json;

use crate::common::fsrs_algorithm_content;

const DAY_MS: i64 = 86_400_000;
const START_MS: i64 = 1_767_261_600_000; // 2026-01-01T10:00:00Z

// WHY: initial stabilities of 100 days predict near-certain recall, so weights fitted to the forgetful synthetic
// history below must beat them.
fn overconfident_content() -> AlgorithmFSRS {
    let mut weights = vec!["100".to_string(); 4];
    weights.extend(
        [
            "6.4133", "0.8334", "3.0194", "0.001", "1.8722", "0.1666", "0.796", "1.4835", "0.0614", "0.2629",
        ]
        .map(String::from),
    );
    weights.extend(["1.6483", "0.6014", "1.8729", "0.5425", "0.0912", "0.0658", "0.1542"].map(String::from));
    AlgorithmFSRS {
        weights: weights.join(", "),
        ..fsrs_algorithm_content()
    }
}

/// Deterministic history: 300 cards, each graded on days 0, 1, 3, 7, 15, and 30.
/// Recall falls with the gap, so long gaps are often Again.
fn forgetful_history() -> Vec<ReviewRecord> {
    let mut seed: u64 = 2023;
    let mut next = || {
        seed = seed
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        i64::try_from((seed >> 33) % 100).expect("below 100")
    };
    let mut reviews = Vec::new();
    for card in 0..300 {
        let mut previous_day = 0;
        for (index, day) in [0_i64, 1, 3, 7, 15, 30].into_iter().enumerate() {
            let gap = day - previous_day;
            previous_day = day;
            let recall_percent = 95 - gap * 2;
            let is_recalled = index == 0 || next() < recall_percent;
            let rating = if is_recalled { 3 } else { 1 };
            reviews.push(ReviewRecord {
                id: format!("{card:04}-{index}"),
                card_id: format!("card-{card:04}"),
                rating,
                state: if index == 0 {
                    CardState::New.as_i32()
                } else {
                    CardState::Review.as_i32()
                },
                created_at: START_MS + day * DAY_MS + card,
            });
        }
    }
    reviews
}

#[test]
fn improved_weights_validate_and_score_better_than_current() {
    let input = OptimizationInput {
        content: overconfident_content(),
        reviews: forgetful_history(),
    };

    let outcome = optimize(&input, &new_progress()).expect("optimization should run");

    let OptimizationOutcome::Improved {
        review_count,
        based_on,
        current,
        optimized,
        weights,
    } = outcome
    else {
        panic!("expected improved weights, got {outcome:?}");
    };
    assert_eq!(review_count, 300 * 6);
    assert_eq!(based_on, input.content);
    assert!(optimized.log_loss < current.log_loss, "{optimized:?} vs {current:?}");
    AlgorithmFSRS {
        weights: weights.clone(),
        ..input.content.clone()
    }
    .validate()
    .expect("found weights pass algorithm validation");
    let decimals: Vec<usize> = weights
        .split(", ")
        .map(|weight| weight.split('.').nth(1).map_or(0, str::len))
        .collect();
    assert_eq!(decimals.len(), 21);
    assert!(
        decimals.iter().all(|count| *count <= 4),
        "weights are rounded to 4 decimals: {weights}"
    );
}

#[test]
fn weights_already_found_are_no_improvement() {
    let reviews = forgetful_history();
    let first = optimize(
        &OptimizationInput {
            content: overconfident_content(),
            reviews: reviews.clone(),
        },
        &new_progress(),
    )
    .expect("optimization should run");
    let OptimizationOutcome::Improved { weights, .. } = first else {
        panic!("expected improved weights, got {first:?}");
    };

    let again = OptimizationInput {
        content: AlgorithmFSRS {
            weights,
            ..overconfident_content()
        },
        reviews,
    };
    let outcome = optimize(&again, &new_progress()).expect("optimization should run");

    let OptimizationOutcome::NoImprovement { current, optimized, .. } = outcome else {
        panic!("expected no improvement, got {outcome:?}");
    };
    assert!(optimized.log_loss >= current.log_loss);
}

#[test]
fn histories_without_a_later_day_are_not_enough_data() {
    let cases = [
        ("no reviews", vec![]),
        (
            "only same-day reviews",
            vec![
                ReviewRecord {
                    id: "1".to_string(),
                    card_id: "a".to_string(),
                    rating: 3,
                    state: CardState::New.as_i32(),
                    created_at: START_MS,
                },
                ReviewRecord {
                    id: "2".to_string(),
                    card_id: "a".to_string(),
                    rating: 3,
                    state: CardState::Learning.as_i32(),
                    created_at: START_MS + 600_000,
                },
            ],
        ),
    ];

    for (case, reviews) in cases {
        let input = OptimizationInput {
            content: fsrs_algorithm_content(),
            reviews,
        };
        let outcome = optimize(&input, &new_progress()).expect("optimization should run");
        assert_eq!(
            outcome,
            OptimizationOutcome::NotEnoughData {
                based_on: fsrs_algorithm_content(),
            },
            "{case}"
        );
    }
}

/// `cards` cards graded on each of `days`, the first from New.
/// Every grade is Good, except each card's last when `is_last_again`.
fn short_history(cards: i64, days: &[i64], is_last_again: bool) -> Vec<ReviewRecord> {
    let mut reviews = Vec::new();
    for card in 0..cards {
        for (index, day) in days.iter().enumerate() {
            let is_last = index + 1 == days.len();
            reviews.push(ReviewRecord {
                id: format!("{card:04}-{index}"),
                card_id: format!("card-{card:04}"),
                rating: if is_last && is_last_again { 1 } else { 3 },
                state: if index == 0 {
                    CardState::New.as_i32()
                } else {
                    CardState::Review.as_i32()
                },
                created_at: START_MS + day * DAY_MS + card,
            });
        }
    }
    reviews
}

#[test]
fn histories_the_crate_does_not_train_on_are_not_enough_data() {
    // WHY: below its training floors the crate returns its defaults, whole or with only the initial stabilities fitted.
    // Each row was offered as improved or scored before; applying it would swap fitted weights for the defaults.
    let cases = [
        ("1 card, Good then Again 2 days later", short_history(1, &[0, 2], true)),
        (
            "7 cards, 2 reviews each: below 8 items",
            short_history(7, &[0, 3], false),
        ),
        (
            "20 cards, 3 reviews each: below 64 items",
            short_history(20, &[0, 2, 6], false),
        ),
        (
            "70 cards, 2 reviews each: every item a card's first",
            short_history(70, &[0, 3], false),
        ),
    ];

    for (case, reviews) in cases {
        let input = OptimizationInput {
            content: fsrs_algorithm_content(),
            reviews,
        };
        let outcome = optimize(&input, &new_progress()).expect("optimization should run");
        assert_eq!(
            outcome,
            OptimizationOutcome::NotEnoughData {
                based_on: fsrs_algorithm_content(),
            },
            "{case}"
        );
    }
}

#[test]
fn abort_requested_before_the_run_cancels_it() {
    // WHY: apps/electron/IPC.md promises `cancelled` for a cancelled run, including one with nothing to learn from.
    let cases = [("trainable history", forgetful_history()), ("no reviews", vec![])];

    for (case, reviews) in cases {
        let input = OptimizationInput {
            content: overconfident_content(),
            reviews,
        };
        let progress = new_progress();
        request_abort(&progress);

        let outcome = optimize(&input, &progress).expect("a cancelled run is not an error");

        assert_eq!(outcome, OptimizationOutcome::Cancelled, "{case}");
    }
}

#[test]
fn outcomes_serialize_tagged_by_status_in_camel_case() {
    let scores = FitScores {
        log_loss: 0.5,
        rmse: 0.25,
    };
    let improved = OptimizationOutcome::Improved {
        review_count: 7,
        based_on: fsrs_algorithm_content(),
        current: scores,
        optimized: scores,
        weights: "1, 2".to_string(),
    };

    assert_eq!(
        serde_json::to_value(&improved).expect("serializes"),
        json!({
            "status": "improved",
            "reviewCount": 7,
            "basedOn": serde_json::to_value(fsrs_algorithm_content()).expect("serializes"),
            "current": { "logLoss": 0.5, "rmse": 0.25 },
            "optimized": { "logLoss": 0.5, "rmse": 0.25 },
            "weights": "1, 2",
        })
    );
    assert_eq!(
        serde_json::to_value(OptimizationOutcome::Cancelled).expect("serializes"),
        json!({ "status": "cancelled" })
    );
}
