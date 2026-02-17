#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use koloda_native_tauri::run;

fn main() {
    run();
}
