use tauri::command;

use crate::{
    app::db::DB,
    app::error::AppError,
    domain::decks::{Deck, DeleteDeckData, InsertDeckData, UpdateDeckData},
    repo::decks as repo,
};

#[command]
pub fn cmd_get_decks(db: DB<'_>) -> Result<Vec<Deck>, AppError> {
    repo::get_decks(&db)
}

#[command]
pub fn cmd_get_deck(db: DB<'_>, id: i64) -> Result<Option<Deck>, AppError> {
    repo::get_deck(&db, id)
}

#[command]
pub fn cmd_add_deck(db: DB<'_>, data: InsertDeckData) -> Result<Deck, AppError> {
    repo::add_deck(&db, data)
}

#[command]
pub fn cmd_update_deck(db: DB<'_>, data: UpdateDeckData) -> Result<Deck, AppError> {
    repo::update_deck(&db, data)
}

#[command]
pub fn cmd_delete_deck(db: DB<'_>, data: DeleteDeckData) -> Result<(), AppError> {
    repo::delete_deck(&db, data)
}
