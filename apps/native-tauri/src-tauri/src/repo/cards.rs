use rusqlite::{params, OptionalExtension};

use crate::app::db::Database;
use crate::app::error::{error_codes, AppError};
use crate::app::utility::get_current_timestamp;
use crate::domain::cards::{Card, CardContent, DeleteCardData, InsertCardData, ResetCardProgressData, UpdateCardData};
use crate::repo::templates::get_template;

pub fn get_card_row(row: &rusqlite::Row<'_>) -> Result<Card, rusqlite::Error> {
    let content_str: String = row.get(3)?;
    let content: CardContent = serde_json::from_str(&content_str).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(content_str.len(), rusqlite::types::Type::Text, Box::new(e))
    })?;

    Ok(Card {
        id: row.get(0)?,
        deck_id: row.get(1)?,
        template_id: row.get(2)?,
        content,
        state: row.get(4)?,
        due_at: row.get(5)?,
        stability: row.get(6)?,
        difficulty: row.get(7)?,
        scheduled_days: row.get(8)?,
        learning_steps: row.get(9)?,
        reps: row.get(10)?,
        lapses: row.get(11)?,
        last_reviewed_at: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

pub fn get_cards(db: &Database, deck_id: i64) -> Result<Vec<Card>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, deck_id, template_id, content, state, due_at, stability, difficulty,
                   scheduled_days, learning_steps, reps, lapses, last_reviewed_at, created_at, updated_at
            FROM cards
            WHERE deck_id = ?1
            ORDER BY created_at
            "#,
        )?;

        let cards = stmt
            .query_map(params![deck_id], get_card_row)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(cards)
    })
}

pub fn get_card(db: &Database, id: i64) -> Result<Option<Card>, AppError> {
    db.with_conn(|conn| {
        conn.query_row(
            r#"
            SELECT id, deck_id, template_id, content, state, due_at, stability, difficulty,
                   scheduled_days, learning_steps, reps, lapses, last_reviewed_at, created_at, updated_at
            FROM cards
            WHERE id = ?1
            LIMIT 1
            "#,
            params![id],
            get_card_row,
        )
        .optional()
        .map_err(AppError::from)
    })
}

pub fn add_card(db: &Database, data: InsertCardData) -> Result<Card, AppError> {
    let template = get_template(db, data.template_id)?.ok_or_else(|| {
        AppError::new(
            error_codes::NOT_FOUND_CARDS_ADD_TEMPLATE,
            Some(format!("Template id: {}", data.template_id)),
        )
    })?;

    data.validate(&template.content.fields)?;

    let now = get_current_timestamp()?;

    let id = db.with_conn(|conn| {
        conn.execute(
            r#"
            INSERT INTO cards (deck_id, template_id, content, state, due_at, stability,
                              difficulty, scheduled_days, learning_steps, reps, lapses,
                              last_reviewed_at, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, NULL)
            "#,
            params![
                data.deck_id,
                data.template_id,
                serde_json::to_string(&data.content)?,
                data.state.unwrap_or(0),
                data.due_at,
                data.stability,
                data.difficulty,
                data.scheduled_days.unwrap_or(0),
                data.learning_steps.unwrap_or(0),
                data.reps.unwrap_or(0),
                data.lapses.unwrap_or(0),
                data.last_reviewed_at,
                now
            ],
        )?;

        Ok(conn.last_insert_rowid())
    })?;

    get_card(db, id)?.ok_or_else(|| AppError::new(error_codes::DB_ADD, None))
}

pub fn update_card(db: &Database, data: UpdateCardData) -> Result<Card, AppError> {
    let original = get_card(db, data.id)?.ok_or_else(|| {
        AppError::new(
            error_codes::NOT_FOUND_CARDS_UPDATE_CARD,
            Some(format!("Card id: {}", data.id)),
        )
    })?;

    let template = get_template(db, original.template_id)?.ok_or_else(|| {
        AppError::new(
            error_codes::NOT_FOUND_CARDS_UPDATE_TEMPLATE,
            Some(format!("Template id: {}", original.template_id)),
        )
    })?;

    data.values.validate(&template.content.fields)?;

    let now = get_current_timestamp()?;

    db.with_conn(|conn| {
        conn.execute(
            r#"
            UPDATE cards
            SET content = ?1, updated_at = ?2
            WHERE id = ?3
            "#,
            params![serde_json::to_string(&data.values.content)?, now, data.id],
        )?;

        Ok(())
    })?;

    get_card(db, data.id)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))
}

pub fn delete_card(db: &Database, data: DeleteCardData) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute("DELETE FROM cards WHERE id = ?1", params![data.id])?;

        Ok(())
    })
}

pub fn reset_card_progress(db: &Database, data: ResetCardProgressData) -> Result<Card, AppError> {
    let now = get_current_timestamp()?;

    db.with_conn(|conn| {
        conn.execute("DELETE FROM reviews WHERE card_id = ?1", params![data.id])?;

        conn.execute(
            r#"
            UPDATE cards
            SET state = 0, due_at = NULL, stability = 0, difficulty = 0,
                scheduled_days = 0, learning_steps = 0, reps = 0, lapses = 0,
                last_reviewed_at = NULL, updated_at = ?1
            WHERE id = ?2
            "#,
            params![now, data.id],
        )?;

        Ok(())
    })?;

    get_card(db, data.id)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))
}
