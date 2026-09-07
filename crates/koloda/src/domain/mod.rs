//! Domain DTOs, validation, and serde — mirrors `@koloda/srs` / `@koloda/app`.
//!
//! Must not import `rusqlite`. Shared errors via `crate::app::error::AppError` are intentional
//! so validation codes stay aligned with the TS app layer.
//!
//! Key shapes: `cards::CardState` (FSRS ints in SQL), `progress` (shared FSRS field bounds),
//! `settings_*` slices (`LearningDefaults`, `DailyLimits`), `algorithms` content as `AlgorithmFSRS`,
//! `conversations::Conversation.state` (opaque TS blob).

pub mod ai;
pub mod algorithms;
pub mod algorithms_fsrs;
pub mod cards;
pub mod common;
pub mod conversations;
pub mod decks;
pub mod learning_day;
pub mod lessons;
pub mod progress;
pub mod reviews;
pub mod settings;
pub mod settings_ai;
pub mod settings_hotkeys;
pub mod settings_interface;
pub mod settings_learning;
pub mod templates;
pub mod time;
