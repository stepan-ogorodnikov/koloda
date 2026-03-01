pub mod app;
pub mod commands;
pub mod domain;
pub mod migrations;
pub mod repo;

use app::db;
use app::init::{get_db_status, seed_db};
use commands::{
    ai::{cmd_add_ai_profile, cmd_get_ai_profiles, cmd_remove_ai_profile, cmd_touch_ai_profile, cmd_update_ai_profile},
    algorithms::{
        cmd_add_algorithm, cmd_clone_algorithm, cmd_delete_algorithm, cmd_get_algorithm, cmd_get_algorithm_decks,
        cmd_get_algorithms, cmd_update_algorithm,
    },
    cards::{
        cmd_add_card, cmd_add_cards, cmd_delete_card, cmd_get_card, cmd_get_cards, cmd_reset_card_progress,
        cmd_update_card,
    },
    decks::{cmd_add_deck, cmd_delete_deck, cmd_get_deck, cmd_get_decks, cmd_update_deck},
    lessons::{cmd_get_lesson_data, cmd_get_lessons, cmd_submit_lesson_result},
    reviews::{cmd_get_review_totals, cmd_get_reviews, cmd_get_todays_review_totals},
    settings::{cmd_get_settings, cmd_patch_settings, cmd_set_settings},
    templates::{
        cmd_add_template, cmd_clone_template, cmd_delete_template, cmd_get_template, cmd_get_template_decks,
        cmd_get_templates, cmd_update_template,
    },
};
use tauri::Manager;
use tauri_plugin_http::init as http_init;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(http_init())
        .plugin(tauri_plugin_cors_fetch::init())
        .setup(|app| {
            let db = db::Database::init(app.handle()).expect("Failed to initialize database");
            app.manage(db);

            Ok(())
        })
        .on_window_event(|window, event| {
            // Checkpoint WAL into main db file
            if let tauri::WindowEvent::Destroyed = event {
                let app_handle = window.app_handle();
                if let Some(db) = app_handle.try_state::<db::Database>() {
                    let _ = db.checkpoint();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_db_status,
            seed_db,
            cmd_add_ai_profile,
            cmd_update_ai_profile,
            cmd_remove_ai_profile,
            cmd_touch_ai_profile,
            cmd_get_ai_profiles,
            cmd_get_settings,
            cmd_set_settings,
            cmd_patch_settings,
            cmd_get_algorithms,
            cmd_get_algorithm,
            cmd_add_algorithm,
            cmd_update_algorithm,
            cmd_clone_algorithm,
            cmd_delete_algorithm,
            cmd_get_algorithm_decks,
            cmd_get_templates,
            cmd_get_template,
            cmd_add_template,
            cmd_update_template,
            cmd_clone_template,
            cmd_delete_template,
            cmd_get_template_decks,
            cmd_get_decks,
            cmd_get_deck,
            cmd_add_deck,
            cmd_update_deck,
            cmd_delete_deck,
            cmd_get_cards,
            cmd_get_card,
            cmd_add_card,
            cmd_add_cards,
            cmd_update_card,
            cmd_delete_card,
            cmd_reset_card_progress,
            cmd_get_reviews,
            cmd_get_review_totals,
            cmd_get_todays_review_totals,
            cmd_get_lessons,
            cmd_get_lesson_data,
            cmd_submit_lesson_result,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
