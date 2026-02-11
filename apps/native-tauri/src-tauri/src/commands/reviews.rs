use tauri::command;

use crate::{
    app::db::DB,
    app::error::AppError,
    domain::reviews::{GetReviewTotalsParams, GetReviewsData, Review, ReviewTotals, TodaysReviewTotals},
    repo::reviews as repo,
};

#[command]
pub fn cmd_get_reviews(db: DB<'_>, data: GetReviewsData) -> Result<Vec<Review>, AppError> {
    repo::get_reviews(&db, data)
}

#[command]
pub fn cmd_get_review_totals(db: DB<'_>, data: GetReviewTotalsParams) -> Result<ReviewTotals, AppError> {
    repo::get_review_totals(&db, data)
}

#[command]
pub fn cmd_get_todays_review_totals(db: DB<'_>) -> Result<TodaysReviewTotals, AppError> {
    repo::get_todays_review_totals(&db)
}
