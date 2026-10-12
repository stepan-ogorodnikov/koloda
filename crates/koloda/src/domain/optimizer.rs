//! FSRS weight optimization — Rust-only and desktop-only, with no TS twin.
//!
//! Fitting lives here; scheduling stays in `@koloda/srs` (ts-fsrs). What the two must agree on, the weight count and
//! how days between reviews are counted, is `docs/decisions/FSRS-OPTIMIZER.md`.

use std::collections::BTreeMap;

use chrono::{DateTime, NaiveDate};
use fsrs::{FSRSItem, FSRSReview};

use crate::domain::algorithms_fsrs::AlgorithmFSRS;
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
