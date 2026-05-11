use rusqlite::{params, OptionalExtension};

use crate::app::db::Database;
use crate::app::error::{error_codes, AppError};
use crate::app::utility::get_current_timestamp;
use crate::domain::decks::{Deck, DeleteDeckData, InsertDeckData, UpdateDeckData};

fn get_deck_row(row: &rusqlite::Row<'_>) -> Result<Deck, rusqlite::Error> {
    Ok(Deck {
        id: row.get(0)?,
        title: row.get(1)?,
        algorithm_id: row.get(2)?,
        template_id: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

pub fn get_decks(db: &Database) -> Result<Vec<Deck>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, title, algorithm_id, template_id, created_at, updated_at
            FROM decks
            ORDER BY created_at
            "#,
        )?;

        let decks = stmt.query_map([], get_deck_row)?.collect::<Result<Vec<_>, _>>()?;

        Ok(decks)
    })
}

pub fn get_deck(db: &Database, id: i64) -> Result<Option<Deck>, AppError> {
    db.with_conn(|conn| {
        conn.query_row(
            r#"
            SELECT id, title, algorithm_id, template_id, created_at, updated_at
            FROM decks
            WHERE id = ?1
            LIMIT 1
            "#,
            params![id],
            get_deck_row,
        )
        .optional()
        .map_err(AppError::from)
    })
}

pub fn add_deck(db: &Database, data: InsertDeckData) -> Result<Deck, AppError> {
    data.validate()?;

    let now = get_current_timestamp()?;

    let id = db.with_conn(|conn| {
        conn.execute(
            r#"
            INSERT INTO decks (title, algorithm_id, template_id, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, NULL)
            "#,
            params![data.title, data.algorithm_id, data.template_id, now],
        )?;

        Ok(conn.last_insert_rowid())
    })?;

    get_deck(db, id)?.ok_or_else(|| AppError::new(error_codes::DB_ADD, None))
}

pub fn update_deck(db: &Database, data: UpdateDeckData) -> Result<Deck, AppError> {
    data.values.validate()?;

    let now = get_current_timestamp()?;

    db.with_conn(|conn| {
        conn.execute(
            r#"
            UPDATE decks
            SET
                title = ?1,
                algorithm_id = ?2,
                template_id = ?3,
                updated_at = ?4
            WHERE id = ?5
            "#,
            params![
                data.values.title,
                data.values.algorithm_id,
                data.values.template_id,
                now,
                data.id
            ],
        )?;

        Ok(())
    })?;

    get_deck(db, data.id)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))
}

pub fn delete_deck(db: &Database, data: DeleteDeckData) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute("DELETE FROM decks WHERE id = ?1", params![data.id])?;

        Ok(())
    })
}
