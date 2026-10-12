//! Reads what FSRS weight optimization learns from. Rust-only, like `domain/optimizer`.

use rusqlite::{params, OptionalExtension};

use crate::app::db::{parse_json_column, Database};
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::domain::algorithms_fsrs::AlgorithmFSRS;
use crate::domain::optimizer::{OptimizationInput, ReviewRecord};

/// The algorithm's saved parameters and every review of the cards in decks that use it now.
pub fn get_optimization_input(db: &Database, algorithm_id: &str) -> Result<OptimizationInput, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let content = conn
                .query_row(
                    "SELECT content FROM algorithms WHERE id = ?1",
                    params![algorithm_id],
                    |row| {
                        let content: String = row.get(0)?;
                        parse_json_column::<AlgorithmFSRS>(0, &content)
                    },
                )
                .optional()?
                .ok_or_else(|| {
                    AppError::new(
                        error_codes::NOT_FOUND_ALGORITHMS_OPTIMIZE_ALGORITHM,
                        Some(format!("Algorithm id: {}", algorithm_id)),
                    )
                })?;

            let mut statement = conn.prepare(
                r#"
                SELECT r.id, r.card_id, r.rating, r.state, r.created_at
                FROM reviews r
                JOIN cards c ON c.id = r.card_id
                JOIN decks d ON d.id = c.deck_id
                WHERE d.algorithm_id = ?1 AND r.is_ignored = 0
                "#,
            )?;
            let reviews = statement
                .query_map(params![algorithm_id], |row| {
                    Ok(ReviewRecord {
                        id: row.get(0)?,
                        card_id: row.get(1)?,
                        rating: row.get(2)?,
                        state: row.get(3)?,
                        created_at: row.get(4)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(OptimizationInput { content, reviews })
        })
    })
}
