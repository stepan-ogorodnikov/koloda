use rusqlite::{params, OptionalExtension};
use serde_json::Value;

use crate::app::db::Database;
use crate::app::error::{error_codes, AppError};
use crate::app::utility::get_current_timestamp;
use crate::domain::algorithms::{
    Algorithm, AlgorithmDeck, CloneAlgorithmData, DeleteAlgorithmData, InsertAlgorithmData, UpdateAlgorithmData,
};

fn get_algorithm_row(row: &rusqlite::Row<'_>) -> Result<Algorithm, rusqlite::Error> {
    let content_str: String = row.get(2)?;
    let content: Value = serde_json::from_str(&content_str).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(content_str.len(), rusqlite::types::Type::Text, Box::new(e))
    })?;

    Ok(Algorithm {
        id: row.get(0)?,
        title: row.get(1)?,
        content,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn get_algorithm_deck_row(row: &rusqlite::Row<'_>) -> Result<AlgorithmDeck, rusqlite::Error> {
    Ok(AlgorithmDeck {
        id: row.get(0)?,
        title: row.get(1)?,
    })
}

pub fn get_algorithms(db: &Database) -> Result<Vec<Algorithm>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, title, content, created_at, updated_at
            FROM algorithms
            ORDER BY created_at
            "#,
        )?;

        let algorithms = stmt.query_map([], get_algorithm_row)?.collect::<Result<Vec<_>, _>>()?;

        Ok(algorithms)
    })
}

pub fn get_algorithm(db: &Database, id: i64) -> Result<Option<Algorithm>, AppError> {
    db.with_conn(|conn| {
        conn.query_row(
            r#"
            SELECT id, title, content, created_at, updated_at
            FROM algorithms
            WHERE id = ?1
            LIMIT 1
            "#,
            params![id],
            get_algorithm_row,
        )
        .optional()
        .map_err(AppError::from)
    })
}

pub fn add_algorithm(db: &Database, data: InsertAlgorithmData) -> Result<Algorithm, AppError> {
    data.validate()?;
    let now = get_current_timestamp()?;

    let id = db.with_conn(|conn| {
        conn.execute(
            r#"
            INSERT INTO algorithms (title, content, created_at, updated_at)
            VALUES (?1, ?2, ?3, NULL)
            "#,
            params![data.title, data.content.to_string(), now],
        )?;

        Ok(conn.last_insert_rowid())
    })?;

    get_algorithm(db, id)?.ok_or_else(|| AppError::new(error_codes::DB_ADD, None))
}

pub fn update_algorithm(db: &Database, data: UpdateAlgorithmData) -> Result<Algorithm, AppError> {
    data.values.validate()?;

    let now = get_current_timestamp()?;

    db.with_conn(|conn| {
        conn.execute(
            r#"
            UPDATE algorithms
            SET
                title = ?1,
                content = ?2,
                updated_at = ?3
            WHERE id = ?4
            "#,
            params![data.values.title, data.values.content.to_string(), now, data.id],
        )?;

        Ok(())
    })?;

    get_algorithm(db, data.id)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))
}

pub fn clone_algorithm(db: &Database, data: CloneAlgorithmData) -> Result<Algorithm, AppError> {
    let source = get_algorithm(db, data.source_id)?.ok_or_else(|| {
        AppError::new(
            error_codes::NOT_FOUND_ALGORITHMS_CLONE_SOURCE,
            Some(format!("Algorithm id: {}", data.source_id)),
        )
    })?;

    let insert_data = InsertAlgorithmData {
        title: data.title,
        content: source.content,
    };

    add_algorithm(db, insert_data)
}

pub fn delete_algorithm(db: &Database, data: DeleteAlgorithmData) -> Result<(), AppError> {
    db.with_transaction(|tx| {
        let has_decks: bool = tx
            .query_row(
                r#"
                SELECT COUNT(*) > 0
                FROM decks
                WHERE algorithm_id = ?1
                "#,
                params![data.id],
                |row| row.get(0),
            )
            .map_err(AppError::from)?;

        if has_decks {
            let successor_id = data.successor_id.ok_or_else(|| {
                AppError::new(
                    error_codes::NOT_FOUND_ALGORITHMS_DELETE_SUCCESSOR,
                    Some("Missing successor id".to_string()),
                )
            })?;

            let does_successor_exist: bool = tx
                .query_row(
                    r#"
                    SELECT COUNT(*) > 0
                    FROM algorithms
                    WHERE id = ?1
                    "#,
                    params![successor_id],
                    |row| row.get(0),
                )
                .map_err(AppError::from)?;

            if !does_successor_exist {
                return Err(AppError::new(
                    error_codes::NOT_FOUND_ALGORITHMS_DELETE_SUCCESSOR,
                    Some(format!("Successor id: {}", successor_id)),
                ));
            }

            tx.execute(
                r#"
                UPDATE decks
                SET algorithm_id = ?1
                WHERE algorithm_id = ?2
                "#,
                params![successor_id, data.id],
            )?;
        }

        tx.execute("DELETE FROM algorithms WHERE id = ?1", params![data.id])?;

        Ok(())
    })
}

pub fn get_algorithm_decks(db: &Database, id: i64) -> Result<Vec<AlgorithmDeck>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, title
            FROM decks
            WHERE algorithm_id = ?1
            "#,
        )?;

        let decks = stmt
            .query_map(params![id], get_algorithm_deck_row)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(decks)
    })
}
