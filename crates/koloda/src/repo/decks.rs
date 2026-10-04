//! Deck SQL — mirrors `@koloda/db-sqlite` `lib/decks.ts`.
//!
//! SQL only. Validation lives in `domain/decks`.

use koloda_sync_proto::payload::{self as wire, InitialProductTs, Payload};
use koloda_sync_proto::registry::Kind;
use rusqlite::{params, Connection, OptionalExtension};

use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::app::utility::{get_current_timestamp, minted_uuidv7};
use crate::domain::common::{normalize_optional_notes, normalize_required_title};
use crate::domain::decks::{Deck, DeleteDeckData, InsertDeckData, UpdateDeckData};
use crate::repo::algorithms::get_algorithm;
use crate::repo::sync::capture::Capture;
use crate::repo::templates::get_template;

fn get_deck_row(row: &rusqlite::Row<'_>) -> Result<Deck, rusqlite::Error> {
    Ok(Deck {
        id: row.get(0)?,
        title: row.get(1)?,
        algorithm_id: row.get(2)?,
        template_id: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        notes: row.get(6)?,
    })
}

pub fn get_decks(db: &Database) -> Result<Vec<Deck>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                r#"
                SELECT id, title, algorithm_id, template_id, created_at, updated_at, notes
                FROM decks
                ORDER BY created_at
                "#,
            )?;

            let decks = stmt.query_map([], get_deck_row)?.collect::<Result<Vec<_>, _>>()?;

            Ok(decks)
        })
    })
}

pub fn get_decks_by_ids(db: &Database, ids: &[String]) -> Result<Vec<Deck>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        let placeholders: Vec<String> = ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
        let sql = format!(
            r#"
            SELECT id, title, algorithm_id, template_id, created_at, updated_at, notes
            FROM decks
            WHERE id IN ({})
            ORDER BY created_at
            "#,
            placeholders.join(", ")
        );

        db.with_conn(|conn| {
            let params: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
            let mut stmt = conn.prepare(&sql)?;
            let decks = stmt
                .query_map(params.as_slice(), get_deck_row)?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(decks)
        })
    })
}

pub fn get_deck(db: &Database, id: &str) -> Result<Option<Deck>, AppError> {
    throw_known_error(error_codes::DB_GET, || db.with_conn(|conn| select_deck(conn, id)))
}

fn select_deck(conn: &Connection, id: &str) -> Result<Option<Deck>, AppError> {
    conn.query_row(
        r#"
        SELECT id, title, algorithm_id, template_id, created_at, updated_at, notes
        FROM decks
        WHERE id = ?1
        LIMIT 1
        "#,
        params![id],
        get_deck_row,
    )
    .optional()
    .map_err(AppError::from)
}

// INVARIANT: a deck create carries no pointers; its algorithm and template travel as same-commit update groups
// (crates/koloda-sync-proto/PROTOCOL.md, Existence and order). A legacy `updated_at` cannot be attributed to a
// group, so it travels only as the create's floor.
pub(crate) fn create_payloads(conn: &Connection, id: &str) -> Result<[Payload; 3], AppError> {
    let deck = select_deck(conn, id)?.ok_or_else(|| AppError::new(error_codes::DB_GET, None))?;

    Ok([
        Payload::DeckCreate(wire::DeckCreate {
            title: deck.title,
            notes: deck.notes,
            created_at: deck.created_at,
            initial_product_ts: InitialProductTs::new(),
            legacy_product_ts_floor: deck.updated_at,
        }),
        Payload::DeckAlgorithm(wire::DeckAlgorithm {
            algorithm_id: deck.algorithm_id,
            updated_at: None,
        }),
        Payload::DeckTemplate(wire::DeckTemplate {
            template_id: deck.template_id,
            updated_at: None,
        }),
    ])
}

pub fn add_deck(db: &Database, data: InsertDeckData) -> Result<Deck, AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        data.validate()?;

        get_algorithm(db, &data.algorithm_id)?.ok_or_else(|| {
            AppError::new(
                error_codes::NOT_FOUND_DECKS_ADD_ALGORITHM,
                Some(format!("Algorithm id: {}", data.algorithm_id)),
            )
        })?;
        get_template(db, &data.template_id)?.ok_or_else(|| {
            AppError::new(
                error_codes::NOT_FOUND_DECKS_ADD_TEMPLATE,
                Some(format!("Template id: {}", data.template_id)),
            )
        })?;

        let now = get_current_timestamp()?;
        let title = normalize_required_title(&data.title);

        let id = db.with_transaction(|tx| {
            let id = minted_uuidv7(None);
            tx.execute(
                r#"
                INSERT INTO decks (id, title, algorithm_id, template_id, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, NULL)
                "#,
                params![id, title, data.algorithm_id, data.template_id, now],
            )?;

            let mut capture = Capture::begin(tx)?;
            for payload in create_payloads(tx, &id)? {
                capture.write(&id, None, &payload)?;
            }

            Ok(id)
        })?;

        get_deck(db, &id)?.ok_or_else(|| AppError::new(error_codes::DB_ADD, None))
    })
}

pub fn update_deck(db: &Database, data: UpdateDeckData) -> Result<Deck, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        data.values.validate()?;

        get_deck(db, &data.id)?.ok_or_else(|| {
            AppError::new(
                error_codes::NOT_FOUND_DECKS_UPDATE_DECK,
                Some(format!("Deck id: {}", data.id)),
            )
        })?;
        get_algorithm(db, &data.values.algorithm_id)?.ok_or_else(|| {
            AppError::new(
                error_codes::NOT_FOUND_DECKS_UPDATE_ALGORITHM,
                Some(format!("Algorithm id: {}", data.values.algorithm_id)),
            )
        })?;
        get_template(db, &data.values.template_id)?.ok_or_else(|| {
            AppError::new(
                error_codes::NOT_FOUND_DECKS_UPDATE_TEMPLATE,
                Some(format!("Template id: {}", data.values.template_id)),
            )
        })?;

        let now = get_current_timestamp()?;
        let title = normalize_required_title(&data.values.title);
        let notes = normalize_optional_notes(data.values.notes.clone());

        db.with_transaction(|tx| {
            let original = select_deck(tx, &data.id)?;
            tx.execute(
                r#"
                UPDATE decks
                SET
                    title = ?1,
                    algorithm_id = ?2,
                    template_id = ?3,
                    notes = ?4,
                    updated_at = ?5
                WHERE id = ?6
                "#,
                params![
                    title,
                    data.values.algorithm_id,
                    data.values.template_id,
                    notes,
                    now,
                    data.id
                ],
            )?;

            let Some(original) = original else {
                return Ok(());
            };
            let updated_at = Some(now);
            let mut capture = Capture::begin(tx)?;
            if original.title != title {
                capture.write(&data.id, None, &Payload::DeckTitle(wire::Title { title, updated_at }))?;
            }
            if original.notes != notes {
                capture.write(&data.id, None, &Payload::DeckNotes(wire::Notes { notes, updated_at }))?;
            }
            if original.algorithm_id != data.values.algorithm_id {
                capture.write(
                    &data.id,
                    None,
                    &Payload::DeckAlgorithm(wire::DeckAlgorithm {
                        algorithm_id: data.values.algorithm_id.clone(),
                        updated_at,
                    }),
                )?;
            }
            if original.template_id != data.values.template_id {
                capture.write(
                    &data.id,
                    None,
                    &Payload::DeckTemplate(wire::DeckTemplate {
                        template_id: data.values.template_id.clone(),
                        updated_at,
                    }),
                )?;
            }

            Ok(())
        })?;

        get_deck(db, &data.id)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))
    })
}

pub fn delete_deck(db: &Database, data: DeleteDeckData) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_DELETE, || {
        db.with_transaction(|tx| {
            if select_deck(tx, &data.id)?.is_some() {
                Capture::begin(tx)?.delete(Kind::Decks, &data.id, None, None)?;
            }
            tx.execute(
                r#"
                DELETE FROM reviews
                WHERE card_id IN (SELECT id FROM cards WHERE deck_id = ?1)
                "#,
                params![data.id],
            )?;
            tx.execute("DELETE FROM cards WHERE deck_id = ?1", params![data.id])?;
            tx.execute("DELETE FROM decks WHERE id = ?1", params![data.id])?;

            Ok(())
        })
    })
}
