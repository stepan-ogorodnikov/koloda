//! Algorithm SQL — mirrors `@koloda/db-sqlite` `lib/algorithms.ts`.
//!
//! SQL only. Validation lives in `domain/algorithms`.

use koloda_sync_proto::payload::{self as wire, InitialProductTs, Payload};
use koloda_sync_proto::registry::Kind;
use rusqlite::{params, Connection, OptionalExtension};

use crate::app::db::{parse_json_column, Database};
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::app::utility::{get_current_timestamp, minted_uuidv7};
use crate::domain::algorithms::{
    Algorithm, AlgorithmDeck, AlgorithmRevisionActor, CloneAlgorithmData, DeleteAlgorithmData, InsertAlgorithmData,
    UpdateAlgorithmData,
};
use crate::domain::algorithms_fsrs::AlgorithmFSRS;
use crate::domain::common::{normalize_optional_notes, normalize_required_title};
use crate::repo::settings;
use crate::repo::sync::Capture;

fn get_algorithm_row(row: &rusqlite::Row<'_>) -> Result<Algorithm, rusqlite::Error> {
    let content_str: String = row.get(2)?;
    let content: AlgorithmFSRS = parse_json_column(2, &content_str)?;

    Ok(Algorithm {
        id: row.get(0)?,
        title: row.get(1)?,
        content,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        notes: row.get(5)?,
    })
}

fn get_algorithm_deck_row(row: &rusqlite::Row<'_>) -> Result<AlgorithmDeck, rusqlite::Error> {
    Ok(AlgorithmDeck {
        id: row.get(0)?,
        title: row.get(1)?,
    })
}

pub fn get_algorithms(db: &Database) -> Result<Vec<Algorithm>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                r#"
                SELECT id, title, content, created_at, updated_at, notes
                FROM algorithms
                ORDER BY created_at
                "#,
            )?;

            let algorithms = stmt.query_map([], get_algorithm_row)?.collect::<Result<Vec<_>, _>>()?;

            Ok(algorithms)
        })
    })
}

pub fn get_algorithm(db: &Database, id: &str) -> Result<Option<Algorithm>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            conn.query_row(
                r#"
                SELECT id, title, content, created_at, updated_at, notes
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
    })
}

pub fn add_algorithm(db: &Database, data: InsertAlgorithmData) -> Result<Algorithm, AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        data.validate()?;
        let now = get_current_timestamp()?;

        let id = db.with_transaction(|tx| insert_algorithm(tx, &data, now, None))?;

        get_algorithm(db, &id)?.ok_or_else(|| AppError::new(error_codes::DB_ADD, None))
    })
}

pub(crate) fn oldest_algorithm_id(conn: &Connection) -> Result<Option<String>, AppError> {
    conn.query_row("SELECT id FROM algorithms ORDER BY created_at ASC LIMIT 1", [], |row| {
        row.get(0)
    })
    .optional()
    .map_err(AppError::from)
}

pub(crate) fn insert_algorithm(
    conn: &Connection,
    data: &InsertAlgorithmData,
    now: i64,
    id: Option<&str>,
) -> Result<String, AppError> {
    let id = minted_uuidv7(id);
    let content = serde_json::to_string(&data.content)?;
    let title = normalize_required_title(&data.title);
    conn.execute(
        r#"
        INSERT INTO algorithms (id, title, content, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, NULL)
        "#,
        params![id, title, content, now],
    )?;
    let revision = insert_algorithm_revision(conn, &id, &content, now)?;

    let mut capture = Capture::begin(conn)?;
    capture.write(
        &id,
        None,
        &Payload::AlgorithmCreate(wire::DocumentCreate {
            title,
            notes: None,
            content,
            created_at: now,
            initial_product_ts: InitialProductTs::new(),
            legacy_product_ts_floor: None,
        }),
    )?;
    capture.write(&revision.id, None, &Payload::AlgorithmRevision(revision.payload))?;

    Ok(id)
}

struct InsertedRevision {
    id: String,
    payload: wire::AlgorithmRevision,
}

fn insert_algorithm_revision(
    conn: &Connection,
    algorithm_id: &str,
    content: &str,
    now: i64,
) -> Result<InsertedRevision, AppError> {
    let id = minted_uuidv7(None);
    let actor = serde_json::to_string(&AlgorithmRevisionActor::User)?;
    conn.execute(
        r#"
        INSERT INTO algorithm_revisions (id, algorithm_id, content, actor, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
        params![id, algorithm_id, content, actor, now],
    )?;

    Ok(InsertedRevision {
        id,
        payload: wire::AlgorithmRevision {
            algorithm_id: algorithm_id.to_string(),
            content: content.to_string(),
            actor,
            created_at: now,
        },
    })
}

pub fn update_algorithm(db: &Database, data: UpdateAlgorithmData) -> Result<Algorithm, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        data.values.validate()?;

        let now = get_current_timestamp()?;
        let title = normalize_required_title(&data.values.title);
        let notes = normalize_optional_notes(data.values.notes.clone());

        db.with_transaction(|tx| {
            let (existing_title, existing_notes, existing_content) = tx
                .query_row(
                    "SELECT title, notes, content FROM algorithms WHERE id = ?1",
                    params![data.id],
                    |row| {
                        let content_str: String = row.get(2)?;
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            parse_json_column::<AlgorithmFSRS>(2, &content_str)?,
                        ))
                    },
                )
                .optional()?
                .ok_or_else(|| {
                    AppError::new(
                        error_codes::NOT_FOUND_ALGORITHMS_UPDATE_ALGORITHM,
                        Some(format!("Algorithm id: {}", data.id)),
                    )
                })?;

            let content = serde_json::to_string(&data.values.content)?;
            tx.execute(
                r#"
                UPDATE algorithms
                SET
                    title = ?1,
                    content = ?2,
                    notes = ?3,
                    updated_at = ?4
                WHERE id = ?5
                "#,
                params![title, content, notes, now, data.id],
            )?;
            let updated_at = Some(now);
            let mut capture = Capture::begin(tx)?;
            if existing_title != title {
                capture.write(
                    &data.id,
                    None,
                    &Payload::AlgorithmTitle(wire::Title { title, updated_at }),
                )?;
            }
            if existing_notes != notes {
                capture.write(
                    &data.id,
                    None,
                    &Payload::AlgorithmNotes(wire::Notes { notes, updated_at }),
                )?;
            }
            // WHY: title and notes are not parameters, so only a content change is a revision.
            // Twin of TS `updateAlgorithm`.
            if existing_content != data.values.content {
                let revision = insert_algorithm_revision(tx, &data.id, &content, now)?;
                capture.write(
                    &data.id,
                    None,
                    &Payload::AlgorithmContent(wire::JsonContent { content, updated_at }),
                )?;
                capture.write(&revision.id, None, &Payload::AlgorithmRevision(revision.payload))?;
            }

            Ok(())
        })?;

        get_algorithm(db, &data.id)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))
    })
}

pub fn clone_algorithm(db: &Database, data: CloneAlgorithmData) -> Result<Algorithm, AppError> {
    throw_known_error(error_codes::DB_CLONE, || {
        let source = get_algorithm(db, &data.source_id)?.ok_or_else(|| {
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
    })
}

pub fn delete_algorithm(db: &Database, data: DeleteAlgorithmData) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_DELETE, || {
        db.with_transaction(|tx| {
            // INVARIANT: the learning default (LEARNING-SETTINGS.md §Defaults) and the last remaining
            // algorithm (ALGORITHMS.md §Deleting Algorithms) are not deletable. UI disable is a
            // convenience, not the enforcement — keep these guards ahead of the successor reassignment.
            let defaults = settings::learning_defaults(tx)?;
            if defaults.is_some_and(|d| d.algorithm == data.id) {
                return Err(AppError::new(error_codes::VALIDATION_ALGORITHMS_DELETE_DEFAULT, None));
            }

            let algorithm_count: i64 = tx.query_row("SELECT COUNT(*) FROM algorithms", [], |row| row.get(0))?;
            if algorithm_count <= 1 {
                return Err(AppError::new(error_codes::VALIDATION_ALGORITHMS_DELETE_LAST, None));
            }

            let mut capture = Capture::begin(tx)?;
            let mut successor: Option<String> = None;
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

                // WHY: self counts as a missing successor — reassigning the decks to the algorithm being
                // deleted would no-op and the delete would violate the decks FK. Twin of TS `deleteAlgorithm`.
                if successor_id == data.id {
                    return Err(AppError::new(
                        error_codes::NOT_FOUND_ALGORITHMS_DELETE_SUCCESSOR,
                        Some(format!("Successor id: {}", successor_id)),
                    ));
                }

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

                let reassigned: Vec<(String, Option<i64>)> = tx
                    .prepare("SELECT id, updated_at FROM decks WHERE algorithm_id = ?1")?
                    .query_map(params![data.id], |row| Ok((row.get(0)?, row.get(1)?)))?
                    .collect::<Result<_, _>>()?;

                tx.execute(
                    r#"
                UPDATE decks
                SET algorithm_id = ?1
                WHERE algorithm_id = ?2
                "#,
                    params![successor_id, data.id],
                )?;

                // WHY: the reassignment leaves `decks.updated_at` alone, so each pointer keeps the deck's
                // current product timestamp; it never raises the deck's `updated_at` on another device.
                for (deck_id, updated_at) in reassigned {
                    capture.write(
                        &deck_id,
                        None,
                        &Payload::DeckAlgorithm(wire::DeckAlgorithm {
                            algorithm_id: successor_id.clone(),
                            updated_at,
                        }),
                    )?;
                }
                successor = Some(successor_id);
            }

            let does_algorithm_exist: bool = tx.query_row(
                "SELECT COUNT(*) > 0 FROM algorithms WHERE id = ?1",
                params![data.id],
                |row| row.get(0),
            )?;
            if does_algorithm_exist {
                capture.delete(Kind::Algorithms, &data.id, None, successor.as_deref())?;
            }
            tx.execute("DELETE FROM algorithms WHERE id = ?1", params![data.id])?;

            Ok(())
        })
    })
}

pub fn get_algorithm_decks(db: &Database, id: &str) -> Result<Vec<AlgorithmDeck>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
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
    })
}
