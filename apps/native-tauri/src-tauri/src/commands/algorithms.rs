use tauri::command;

use crate::{
    app::db::DB,
    app::error::AppError,
    domain::algorithms::{
        Algorithm, AlgorithmDeck, CloneAlgorithmData, DeleteAlgorithmData, InsertAlgorithmData, UpdateAlgorithmData,
    },
    repo::algorithms as repo,
};

#[command]
pub fn cmd_get_algorithms(db: DB<'_>) -> Result<Vec<Algorithm>, AppError> {
    repo::get_algorithms(&db)
}

#[command]
pub fn cmd_get_algorithm(db: DB<'_>, id: i64) -> Result<Option<Algorithm>, AppError> {
    repo::get_algorithm(&db, id)
}

#[command]
pub fn cmd_add_algorithm(db: DB<'_>, data: InsertAlgorithmData) -> Result<Algorithm, AppError> {
    repo::add_algorithm(&db, data)
}

#[command]
pub fn cmd_update_algorithm(db: DB<'_>, data: UpdateAlgorithmData) -> Result<Algorithm, AppError> {
    repo::update_algorithm(&db, data)
}

#[command]
pub fn cmd_clone_algorithm(db: DB<'_>, data: CloneAlgorithmData) -> Result<Algorithm, AppError> {
    repo::clone_algorithm(&db, data)
}

#[command]
pub fn cmd_delete_algorithm(db: DB<'_>, data: DeleteAlgorithmData) -> Result<(), AppError> {
    repo::delete_algorithm(&db, data)
}

#[command]
pub fn cmd_get_algorithm_decks(db: DB<'_>, id: i64) -> Result<Vec<AlgorithmDeck>, AppError> {
    repo::get_algorithm_decks(&db, id)
}
