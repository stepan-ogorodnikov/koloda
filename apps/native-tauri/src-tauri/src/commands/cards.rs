use tauri::command;

use crate::{
    app::db::DB,
    app::error::AppError,
    domain::cards::{Card, DeleteCardData, GetCardsParams, InsertCardData, ResetCardProgressData, UpdateCardData},
    repo::cards as repo,
};

#[command]
pub fn cmd_get_cards(db: DB<'_>, params: GetCardsParams) -> Result<Vec<Card>, AppError> {
    repo::get_cards(&db, params.deck_id)
}

#[command]
pub fn cmd_get_card(db: DB<'_>, id: i64) -> Result<Option<Card>, AppError> {
    repo::get_card(&db, id)
}

#[command]
pub fn cmd_add_card(db: DB<'_>, data: InsertCardData) -> Result<Card, AppError> {
    repo::add_card(&db, data)
}

#[command]
pub fn cmd_add_cards(db: DB<'_>, data: Vec<InsertCardData>) -> Result<Vec<Card>, AppError> {
    repo::add_cards(&db, data)
}

#[command]
pub fn cmd_update_card(db: DB<'_>, data: UpdateCardData) -> Result<Card, AppError> {
    repo::update_card(&db, data)
}

#[command]
pub fn cmd_delete_card(db: DB<'_>, data: DeleteCardData) -> Result<(), AppError> {
    repo::delete_card(&db, data)
}

#[command]
pub fn cmd_reset_card_progress(db: DB<'_>, data: ResetCardProgressData) -> Result<Card, AppError> {
    repo::reset_card_progress(&db, data)
}
