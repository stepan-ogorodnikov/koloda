use crate::domain::cards::{AddCardsItemError, AddCardsItemResult, AddCardsResponse};
use rusqlite::{params, OptionalExtension};

use crate::app::db::{parse_json_column, Database};
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::app::utility::{get_current_timestamp, minted_uuidv7};
use crate::domain::cards::{
    Card, CardContent, CardCount, CardState, DeleteCardData, DeleteCardsData, InsertCardData, ResetCardProgressData,
    UpdateCardData,
};
use crate::domain::templates::Template;
use std::collections::HashMap;

use crate::repo::decks::{get_deck, get_decks_by_ids};
use crate::repo::fsrs_sql;
use crate::repo::templates::{get_template, get_templates_by_ids};

pub fn get_card_row(row: &rusqlite::Row<'_>) -> Result<Card, rusqlite::Error> {
    let content_str: String = row.get(3)?;
    let content: CardContent = parse_json_column(3, &content_str)?;

    Ok(Card {
        id: row.get(0)?,
        deck_id: row.get(1)?,
        template_id: row.get(2)?,
        content,
        state: row.get(4)?,
        due_at: row.get(5)?,
        // INVARIANT: column is nullable in V1; existing rows may be NULL from the old insert.
        // Load NULL as 0.0. Do not change Card.stability/difficulty back to Option to "match SQL".
        stability: row.get::<_, Option<f64>>(6)?.unwrap_or(0.0),
        difficulty: row.get::<_, Option<f64>>(7)?.unwrap_or(0.0),
        scheduled_days: row.get(8)?,
        learning_steps: row.get(9)?,
        reps: row.get(10)?,
        lapses: row.get(11)?,
        last_reviewed_at: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

pub fn get_cards(db: &Database, deck_id: &str) -> Result<Vec<Card>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
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
    })
}

pub fn get_card_counts(db: &Database) -> Result<Vec<CardCount>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT deck_id, COUNT(*) FROM cards GROUP BY deck_id")?;

            let counts = stmt
                .query_map([], |row| {
                    Ok(CardCount {
                        deck_id: row.get(0)?,
                        count: row.get(1)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(counts)
        })
    })
}

pub fn get_card(db: &Database, id: &str) -> Result<Option<Card>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
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
    })
}

pub fn add_card(db: &Database, data: InsertCardData) -> Result<Card, AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        get_deck(db, &data.deck_id)?.ok_or_else(|| {
            AppError::new(
                error_codes::NOT_FOUND_CARDS_ADD_DECK,
                Some(format!("Deck id: {}", data.deck_id)),
            )
        })?;

        let template = get_template(db, &data.template_id)?.ok_or_else(|| {
            AppError::new(
                error_codes::NOT_FOUND_CARDS_ADD_TEMPLATE,
                Some(format!("Template id: {}", data.template_id)),
            )
        })?;

        insert_card_data(db, &data, &template)
    })
}

pub fn add_cards(db: &Database, data: Vec<InsertCardData>) -> Result<AddCardsResponse, AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        if data.is_empty() {
            return Ok(Vec::new());
        }

        let distinct_deck_ids: Vec<String> = {
            let mut ids: Vec<String> = data.iter().map(|c| c.deck_id.clone()).collect();
            ids.sort_unstable();
            ids.dedup();
            ids
        };
        let decks: HashMap<String, _> = get_decks_by_ids(db, &distinct_deck_ids)?
            .into_iter()
            .map(|deck| (deck.id.clone(), deck))
            .collect();

        let distinct_template_ids: Vec<String> = {
            let mut ids: Vec<String> = data.iter().map(|c| c.template_id.clone()).collect();
            ids.sort_unstable();
            ids.dedup();
            ids
        };
        let templates: HashMap<String, Template> = get_templates_by_ids(db, &distinct_template_ids)?;

        let mut results = Vec::with_capacity(data.len());

        for card_data in data.into_iter() {
            if !decks.contains_key(&card_data.deck_id) {
                results.push(AddCardsItemResult {
                    error: Some(AddCardsItemError {
                        code: error_codes::NOT_FOUND_CARDS_ADD_DECK.to_string(),
                        details: None,
                    }),
                });
                continue;
            }

            match templates.get(&card_data.template_id) {
                Some(template) => match insert_card_data(db, &card_data, template) {
                    Ok(_) => results.push(AddCardsItemResult { error: None }),
                    // WHY: keep the real AppError code/details — flattening to Display
                    // would strip the code consumers translate.
                    Err(e) => results.push(AddCardsItemResult { error: Some(e.into()) }),
                },
                None => results.push(AddCardsItemResult {
                    error: Some(AddCardsItemError {
                        code: error_codes::NOT_FOUND_CARDS_ADD_TEMPLATE.to_string(),
                        details: None,
                    }),
                }),
            }
        }

        Ok(results)
    })
}

fn insert_card_data(db: &Database, data: &InsertCardData, template: &Template) -> Result<Card, AppError> {
    data.validate(&template.content.fields)?;

    let now = get_current_timestamp()?;

    let id = db.with_conn(|conn| {
        let id = minted_uuidv7(None);
        conn.execute(
            r#"
            INSERT INTO cards (id, deck_id, template_id, content, state, due_at, stability,
                              difficulty, scheduled_days, learning_steps, reps, lapses,
                              last_reviewed_at, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, NULL)
            "#,
            params![
                id,
                data.deck_id,
                data.template_id,
                serde_json::to_string(&data.content)?,
                data.state.unwrap_or(0),
                data.due_at,
                // WHY: NULL here desyncs desktop IPC from web `z.number()`;
                // omitted InsertCardData must persist 0, not SQL NULL.
                data.stability.unwrap_or(0.0),
                data.difficulty.unwrap_or(0.0),
                data.scheduled_days.unwrap_or(0),
                data.learning_steps.unwrap_or(0),
                data.reps.unwrap_or(0),
                data.lapses.unwrap_or(0),
                data.last_reviewed_at,
                now
            ],
        )?;

        Ok(id)
    })?;

    get_card(db, &id)?.ok_or_else(|| AppError::new(error_codes::DB_ADD, None))
}

pub fn update_card(db: &Database, data: UpdateCardData) -> Result<Card, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        let original = get_card(db, &data.id)?.ok_or_else(|| {
            AppError::new(
                error_codes::NOT_FOUND_CARDS_UPDATE_CARD,
                Some(format!("Card id: {}", data.id)),
            )
        })?;

        let template = get_template(db, &original.template_id)?.ok_or_else(|| {
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

        get_card(db, &data.id)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))
    })
}

pub fn delete_card(db: &Database, data: DeleteCardData) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_DELETE, || {
        db.with_transaction(|tx| {
            tx.execute("DELETE FROM reviews WHERE card_id = ?1", params![data.id])?;
            tx.execute("DELETE FROM cards WHERE id = ?1", params![data.id])?;

            Ok(())
        })
    })
}

pub fn delete_cards(db: &Database, data: DeleteCardsData) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_DELETE, || {
        if data.ids.is_empty() {
            return Ok(());
        }

        let placeholders: Vec<String> = data
            .ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect();
        let in_list = placeholders.join(", ");
        let reviews_sql = format!("DELETE FROM reviews WHERE card_id IN ({in_list})");
        let cards_sql = format!("DELETE FROM cards WHERE id IN ({in_list})");

        let params: Vec<&dyn rusqlite::ToSql> = data.ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();

        db.with_transaction(|tx| {
            tx.execute(&reviews_sql, params.as_slice())?;
            tx.execute(&cards_sql, params.as_slice())?;

            Ok(())
        })
    })
}

pub fn reset_card_progress(db: &Database, data: ResetCardProgressData) -> Result<Card, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        get_card(db, &data.id)?.ok_or_else(|| {
            AppError::new(
                error_codes::NOT_FOUND_CARDS_RESET_CARD,
                Some(format!("Card id: {}", data.id)),
            )
        })?;

        db.with_transaction(|tx| {
            tx.execute("DELETE FROM reviews WHERE card_id = ?1", params![data.id])?;

            tx.execute(
                &format!(
                    r#"
                UPDATE cards
                SET {reset_to_new}, due_at = NULL, stability = 0, difficulty = 0,
                    scheduled_days = 0, learning_steps = 0, reps = 0, lapses = 0,
                    last_reviewed_at = NULL
                WHERE id = ?1
                "#,
                    reset_to_new = fsrs_sql::eq_state("state", CardState::New),
                ),
                params![data.id],
            )?;

            Ok(())
        })?;

        get_card(db, &data.id)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))
    })
}
