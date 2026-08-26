//! Domain tests (no DB). Add a module here; do not add a new `tests/*.rs` crate root.
#[path = "../common/mod.rs"]
mod common;

mod ai_tests;
mod algorithms_fsrs_tests;
mod algorithms_tests;
mod cards_insert_tests;
mod cards_progress_tests;
mod cards_values_tests;
mod conversations_tests;
mod decks_title_tests;
mod learning_day_tests;
mod lessons_amounts_tests;
mod lessons_result_tests;
mod lessons_validation_tests;
mod reviews_serde_tests;
mod reviews_totals_tests;
mod reviews_validation_tests;
mod secrets_tests;
mod settings_ai_tests;
mod settings_hotkeys_tests;
mod settings_interface_tests;
mod settings_learning_tests;
mod templates_insert_tests;
mod templates_update_tests;
