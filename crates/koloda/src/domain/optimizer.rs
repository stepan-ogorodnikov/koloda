//! FSRS weight optimization — Rust-only and desktop-only, with no TS twin.
//!
//! Fitting lives here; scheduling stays in `@koloda/srs` (ts-fsrs). What the two must agree on, the weight count and
//! how days between reviews are counted, is `docs/decisions/FSRS-OPTIMIZER.md`.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, PoisonError};

use chrono::{DateTime, NaiveDate};
use fsrs::{compute_parameters, CombinedProgressState, ComputeParametersInput, FSRSError, FSRSItem, FSRSReview, FSRS};
use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};
use crate::domain::algorithms_fsrs::{AlgorithmFSRS, FSRS6_WEIGHT_COUNT};
use crate::domain::cards::CardState;

/// One review as the optimizer reads it.
///
/// `state` is the card's state before the grade (ts-fsrs `ReviewLog.state`), so a complete history starts at New.
#[derive(Debug, Clone, PartialEq)]
pub struct ReviewRecord {
    pub id: String,
    pub card_id: String,
    pub rating: i32,
    pub state: i32,
    pub created_at: i64,
}

/// Applies an optimization's weights (TS twin: `ApplyAlgorithmOptimizationData` in `@koloda/srs`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyAlgorithmOptimizationData {
    pub id: String,
    pub based_on: AlgorithmFSRS,
    pub weights: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OptimizationInput {
    pub content: AlgorithmFSRS,
    pub reviews: Vec<ReviewRecord>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct TrainingSet {
    pub items: Vec<FSRSItem>,
    /// Dense card index per item, aligned with `items` (`ComputeParametersInput.card_ids`).
    pub card_indices: Vec<i64>,
    pub review_count: usize,
}

struct DatedItem<'a> {
    created_at: i64,
    review_id: &'a str,
    card_index: i64,
    item: FSRSItem,
}

pub fn build_training_set(reviews: &[ReviewRecord]) -> TrainingSet {
    let mut by_card: BTreeMap<&str, Vec<&ReviewRecord>> = BTreeMap::new();
    for review in reviews {
        by_card.entry(review.card_id.as_str()).or_default().push(review);
    }

    let mut dated = Vec::new();
    let mut review_count = 0;
    let mut next_card_index: i64 = 0;
    for mut history in by_card.into_values() {
        history.sort_by(|a, b| a.created_at.cmp(&b.created_at).then_with(|| a.id.cmp(&b.id)));
        let Some(card_items) = card_items(&history, next_card_index) else {
            continue;
        };
        if let Some(last) = card_items.last() {
            review_count += last.item.reviews.len();
            next_card_index += 1;
        }
        dated.extend(card_items);
    }

    // WHY: the crate weights later items more (recency weighting), so items must be in review order across cards.
    dated.sort_by(|a, b| {
        a.created_at
            .cmp(&b.created_at)
            .then_with(|| a.review_id.cmp(b.review_id))
    });

    let mut set = TrainingSet {
        review_count,
        ..TrainingSet::default()
    };
    for entry in dated {
        set.items.push(entry.item);
        set.card_indices.push(entry.card_index);
    }
    set
}

/// One item per prefix of the history that ends at a review on a later day than the previous one.
/// `None` drops the whole card: its history does not start at New, or a review cannot be read.
fn card_items<'a>(history: &[&'a ReviewRecord], card_index: i64) -> Option<Vec<DatedItem<'a>>> {
    if history.first()?.state != CardState::New.as_i32() {
        return None;
    }

    let mut items = Vec::new();
    let mut prefix = Vec::with_capacity(history.len());
    let mut previous_date: Option<NaiveDate> = None;
    for review in history {
        let rating = u32::try_from(review.rating)
            .ok()
            .filter(|rating| (1..=4).contains(rating))?;
        let date = utc_date(review.created_at)?;
        let days = u32::try_from(previous_date.map_or(0, |previous| (date - previous).num_days())).ok()?;
        previous_date = Some(date);

        prefix.push(FSRSReview { rating, delta_t: days });
        // WHY: a same-day review stays in the history but is no item of its own; it teaches no long-term recall.
        if days > 0 {
            items.push(DatedItem {
                created_at: review.created_at,
                review_id: &review.id,
                card_index,
                item: FSRSItem {
                    reviews: prefix.clone(),
                },
            });
        }
    }
    Some(items)
}

/// INVARIANT: twin of ts-fsrs `dateDiffInDays` — elapsed days are differences of UTC calendar dates, not of the
/// learning day (`dayStartsAt`), so the fitted model matches the scheduler that uses it.
fn utc_date(created_at: i64) -> Option<NaiveDate> {
    DateTime::from_timestamp_millis(created_at).map(|time| time.date_naive())
}

/// How well weights predict the reviews they were scored on; lower is better.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FitScores {
    pub log_loss: f64,
    pub rmse: f64,
}

/// Result of one optimization run (TS twin: `AlgorithmOptimization` in `@koloda/srs`).
///
/// `based_on` is the saved content the run read; applying is refused once the stored content differs from it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum OptimizationOutcome {
    NotEnoughData {
        based_on: AlgorithmFSRS,
    },
    NoImprovement {
        review_count: usize,
        based_on: AlgorithmFSRS,
        current: FitScores,
        optimized: FitScores,
    },
    Improved {
        review_count: usize,
        based_on: AlgorithmFSRS,
        current: FitScores,
        optimized: FitScores,
        weights: String,
    },
    Cancelled,
}

/// Shared with a running `optimize`, so another thread can read its progress or cancel it.
/// Keeps the `fsrs` crate an implementation detail of this module.
pub type OptimizationProgress = Arc<Mutex<CombinedProgressState>>;

pub fn new_progress() -> OptimizationProgress {
    CombinedProgressState::new_shared()
}

pub fn request_abort(progress: &OptimizationProgress) {
    progress.lock().unwrap_or_else(PoisonError::into_inner).want_abort = true;
}

/// Training steps done and planned; `(0, 0)` before training starts.
pub fn progress_counts(progress: &OptimizationProgress) -> (usize, usize) {
    let state = progress.lock().unwrap_or_else(PoisonError::into_inner);
    (state.current(), state.total())
}

/// Trains on the input and scores the current and the found weights on the same items.
/// `request_abort` on `progress` cancels the run.
pub fn optimize(input: &OptimizationInput, progress: &OptimizationProgress) -> Result<OptimizationOutcome, AppError> {
    // INVARIANT: a run cancelled before it starts resolves `Cancelled`, whatever its input (apps/electron/IPC.md).
    if is_aborted(progress) {
        return Ok(OptimizationOutcome::Cancelled);
    }
    let set = build_training_set(&input.reviews);
    let based_on = input.content.clone();
    if set.items.is_empty() {
        return Ok(OptimizationOutcome::NotEnoughData { based_on });
    }

    let trained = compute_parameters(ComputeParametersInput {
        train_set: set.items.clone(),
        card_ids: Some(set.card_indices.clone()),
        progress: Some(Arc::clone(progress)),
        enable_short_term: true,
        num_relearning_steps: Some(input.content.relearning_steps.len()),
        training_config: None,
    });
    let trained = match trained {
        Ok(trained) => trained,
        Err(FSRSError::Interrupted) => return Ok(OptimizationOutcome::Cancelled),
        Err(err) => return Err(optimizer_failed(&err)),
    };
    // INVARIANT: the scheduler takes exactly FSRS6_WEIGHT_COUNT weights (docs/decisions/FSRS-OPTIMIZER.md).
    if trained.len() != FSRS6_WEIGHT_COUNT || trained.iter().any(|weight| !weight.is_finite()) {
        return Err(AppError::new(
            error_codes::ALGORITHMS_OPTIMIZER_INVALID_OUTPUT,
            Some(format!("{} weights: {:?}", trained.len(), trained)),
        ));
    }

    let weights = format_weights(&trained);
    let current = parse_weights(&input.content.weights)?;
    // WHY: score the weights as they will be stored, after rounding, not the raw training output.
    let found = parse_weights(&weights)?;
    let (current, optimized) = match (score(&current, &set, progress), score(&found, &set, progress)) {
        (Ok(current), Ok(optimized)) => (current, optimized),
        (Err(FSRSError::Interrupted), _) | (_, Err(FSRSError::Interrupted)) => {
            return Ok(OptimizationOutcome::Cancelled)
        }
        (Err(err), _) | (_, Err(err)) => return Err(optimizer_failed(&err)),
    };

    let review_count = set.review_count;
    if optimized.log_loss < current.log_loss {
        Ok(OptimizationOutcome::Improved {
            review_count,
            based_on,
            current,
            optimized,
            weights,
        })
    } else {
        Ok(OptimizationOutcome::NoImprovement {
            review_count,
            based_on,
            current,
            optimized,
        })
    }
}

// WHY: `evaluate_with_card_ids` walks each card's history once; `evaluate` replays every prefix item, and each run
// scores twice. The crate documents the same predictions and log loss for both.
fn score(weights: &[f32], set: &TrainingSet, progress: &OptimizationProgress) -> Result<FitScores, FSRSError> {
    let evaluation = FSRS::new(weights)?
        .evaluate_with_card_ids(set.items.clone(), set.card_indices.clone(), |_| !is_aborted(progress))?;
    Ok(FitScores {
        log_loss: f64::from(evaluation.log_loss),
        rmse: f64::from(evaluation.rmse_bins),
    })
}

// WHY: a poisoned lock means a panic mid-run; stopping is the only safe reading.
fn is_aborted(progress: &OptimizationProgress) -> bool {
    progress.lock().map_or(true, |state| state.want_abort)
}

fn optimizer_failed(err: &FSRSError) -> AppError {
    AppError::new(error_codes::ALGORITHMS_OPTIMIZER_FAILED, Some(format!("{err:?}")))
}

fn parse_weights(weights: &str) -> Result<Vec<f32>, AppError> {
    weights
        .split(',')
        .map(|weight| weight.trim().parse::<f32>())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| AppError::new(error_codes::ALGORITHMS_OPTIMIZER_FAILED, Some(err.to_string())))
}

/// Four decimals without trailing zeros, joined like the built-in defaults (`0.212, 1.2931, …`).
fn format_weights(weights: &[f32]) -> String {
    weights
        .iter()
        .map(|weight| {
            let fixed = format!("{weight:.4}");
            let trimmed = fixed.trim_end_matches('0').trim_end_matches('.');
            match trimmed {
                "" | "-" | "-0" => "0".to_string(),
                value => value.to_string(),
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}
