use tauri::command;

use crate::{
    app::db::DB,
    app::error::AppError,
    domain::templates::{
        CloneTemplateData, DeleteTemplateData, InsertTemplateData, Template, TemplateDeck, UpdateTemplateData,
    },
    repo::templates as repo,
};

#[command]
pub fn cmd_get_templates(db: DB<'_>) -> Result<Vec<Template>, AppError> {
    repo::get_templates(&db)
}

#[command]
pub fn cmd_get_template(db: DB<'_>, id: i64) -> Result<Option<Template>, AppError> {
    repo::get_template(&db, id)
}

#[command]
pub fn cmd_add_template(db: DB<'_>, data: InsertTemplateData) -> Result<Template, AppError> {
    repo::add_template(&db, data)
}

#[command]
pub fn cmd_update_template(db: DB<'_>, data: UpdateTemplateData) -> Result<Template, AppError> {
    repo::update_template(&db, data)
}

#[command]
pub fn cmd_clone_template(db: DB<'_>, data: CloneTemplateData) -> Result<Template, AppError> {
    repo::clone_template(&db, data)
}

#[command]
pub fn cmd_delete_template(db: DB<'_>, data: DeleteTemplateData) -> Result<(), AppError> {
    repo::delete_template(&db, data)
}

#[command]
pub fn cmd_get_template_decks(db: DB<'_>, id: i64) -> Result<Vec<TemplateDeck>, AppError> {
    repo::get_template_decks(&db, id)
}
