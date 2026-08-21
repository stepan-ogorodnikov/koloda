//! FSRS state bucketing SQL — single source of truth for the repo layer.
//!
//! WHY: The New / Learning(+Relearning) / Review lesson-and-review buckets were
//! previously inlined as ad-hoc CASE / FILTER / WHERE fragments across
//! `repo/lessons.rs`, `repo/reviews.rs`, and `repo/cards.rs`. An agent or dev
//! fixing one site could silently miss the others, so every SQL fragment that
//! buckets rows by [`CardState`] must be built from the helpers here.
//!
//! INVARIANT: helpers render integer literals exclusively via
//! [`CardState::as_i32`]. Per-site time bounds (`due_at` on cards vs
//! `created_at` on the reviews log) are semantically distinct concerns and stay
//! at the call sites.

use crate::domain::cards::CardState;

/// Raw FSRS state equality: `{column} = {state}`.
///
/// Valid inside predicates and on the `SET` side of UPDATE (e.g. progress reset).
pub(crate) fn eq_state(column: &str, state: CardState) -> String {
    format!("{column} = {}", state.as_i32())
}

/// Untouched bucket: `{column} = New`.
pub(crate) fn eq_new(column: &str) -> String {
    eq_state(column, CardState::New)
}

/// Learn bucket — Learning and Relearning both count as "learn":
/// `{column} IN (Learning, Relearning)`.
pub(crate) fn in_learn(column: &str) -> String {
    format!(
        "{column} IN ({}, {})",
        CardState::Learning.as_i32(),
        CardState::Relearning.as_i32()
    )
}

/// Review bucket: `{column} = Review`.
pub(crate) fn eq_review(column: &str) -> String {
    eq_state(column, CardState::Review)
}

/// Every tracked FSRS state (review-log daily totals):
/// `{column} IN (New, Learning, Review, Relearning)`.
pub(crate) fn in_all_tracked(column: &str) -> String {
    format!(
        "{column} IN ({}, {}, {}, {})",
        CardState::New.as_i32(),
        CardState::Learning.as_i32(),
        CardState::Review.as_i32(),
        CardState::Relearning.as_i32()
    )
}
