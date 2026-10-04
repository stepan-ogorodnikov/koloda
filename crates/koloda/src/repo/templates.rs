//! Template SQL — mirrors `@koloda/db-sqlite` `lib/templates.ts`.
//!
//! SQL only. Validation lives in `domain/templates`.

use koloda_sync_proto::payload::{self as wire, InitialProductTs, Payload};
use koloda_sync_proto::registry::Kind;
use rusqlite::{params, Connection, OptionalExtension};

use crate::app::db::{parse_json_column, Database};
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::app::utility::{get_current_timestamp, minted_uuidv7};
use crate::domain::common::{normalize_optional_notes, normalize_required_title};
use crate::domain::templates::{
    CloneTemplateData, DeleteTemplateData, InsertTemplateData, Template, TemplateContent, TemplateDeck,
    UpdateTemplateData,
};
use crate::repo::settings;
use crate::repo::sync::capture::Capture;

fn get_template_row(row: &rusqlite::Row<'_>) -> Result<Template, rusqlite::Error> {
    let content_str: String = row.get(2)?;
    let content: TemplateContent = parse_json_column(2, &content_str)?;

    Ok(Template {
        id: row.get(0)?,
        title: row.get(1)?,
        content,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        is_locked: row.get(5)?,
        notes: row.get(6)?,
    })
}

fn get_template_deck_row(row: &rusqlite::Row<'_>) -> Result<TemplateDeck, rusqlite::Error> {
    Ok(TemplateDeck {
        id: row.get(0)?,
        title: row.get(1)?,
    })
}

pub fn get_templates(db: &Database) -> Result<Vec<Template>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                r#"
                SELECT
                    t.id,
                    t.title,
                    t.content,
                    t.created_at,
                    t.updated_at,
                    EXISTS(
                        SELECT 1 FROM cards c
                        WHERE c.template_id = t.id
                        LIMIT 1
                    ) as is_locked,
                    t.notes
                FROM templates t
                ORDER BY t.created_at
                "#,
            )?;

            let templates = stmt.query_map([], get_template_row)?.collect::<Result<Vec<_>, _>>()?;

            Ok(templates)
        })
    })
}

pub fn get_template(db: &Database, id: &str) -> Result<Option<Template>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            conn.query_row(
                r#"
                SELECT
                    t.id,
                    t.title,
                    t.content,
                    t.created_at,
                    t.updated_at,
                    EXISTS(
                        SELECT 1 FROM cards c
                        WHERE c.template_id = ?1
                        LIMIT 1
                    ) as is_locked,
                    t.notes
                FROM templates t
                WHERE t.id = ?1
                LIMIT 1
                "#,
                params![id],
                get_template_row,
            )
            .optional()
            .map_err(AppError::from)
        })
    })
}

pub fn get_templates_by_ids(
    db: &Database,
    ids: &[String],
) -> Result<std::collections::HashMap<String, Template>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        if ids.is_empty() {
            return Ok(std::collections::HashMap::new());
        }

        let placeholders: Vec<String> = ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
        let sql = format!(
            r#"
            SELECT
                t.id,
                t.title,
                t.content,
                t.created_at,
                t.updated_at,
                EXISTS(
                    SELECT 1 FROM cards c
                    WHERE c.template_id = t.id
                    LIMIT 1
                ) as is_locked,
                t.notes
            FROM templates t
            WHERE t.id IN ({})
            "#,
            placeholders.join(", ")
        );

        db.with_conn(|conn| {
            let params: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
            let mut stmt = conn.prepare(&sql)?;
            let templates = stmt
                .query_map(params.as_slice(), get_template_row)?
                .collect::<Result<Vec<_>, _>>()?;
            let map = templates.into_iter().map(|t| (t.id.clone(), t)).collect();
            Ok(map)
        })
    })
}

pub fn add_template(db: &Database, data: InsertTemplateData) -> Result<Template, AppError> {
    throw_known_error(error_codes::DB_ADD, || {
        data.validate()?;
        let now = get_current_timestamp()?;

        let id = db.with_transaction(|tx| insert_template(tx, &data, now, None))?;

        get_template(db, &id)?.ok_or_else(|| AppError::new(error_codes::DB_ADD, None))
    })
}

pub(crate) fn oldest_template_id(conn: &Connection) -> Result<Option<String>, AppError> {
    conn.query_row("SELECT id FROM templates ORDER BY created_at ASC LIMIT 1", [], |row| {
        row.get(0)
    })
    .optional()
    .map_err(AppError::from)
}

pub(crate) fn insert_template(
    conn: &Connection,
    data: &InsertTemplateData,
    now: i64,
    id: Option<&str>,
) -> Result<String, AppError> {
    let id = minted_uuidv7(id);
    let title = normalize_required_title(&data.title);
    let content = serde_json::to_string(&data.content)?;
    conn.execute(
        r#"
        INSERT INTO templates (id, title, content, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, NULL)
        "#,
        params![id, title, content, now],
    )?;

    Capture::begin(conn)?.write(&id, None, &create_payload(conn, &id)?)?;

    Ok(id)
}

// INVARIANT: a create carries the stored row's current values. A legacy `updated_at` cannot be attributed to a
// group, so it travels only as the create's floor (crates/koloda-sync-proto/PROTOCOL.md, `updated_at`).
pub(crate) fn create_payload(conn: &Connection, id: &str) -> Result<Payload, AppError> {
    conn.query_row(
        "SELECT title, notes, content, created_at, updated_at FROM templates WHERE id = ?1",
        params![id],
        |row| {
            Ok(Payload::TemplateCreate(wire::DocumentCreate {
                title: row.get(0)?,
                notes: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
                initial_product_ts: InitialProductTs::new(),
                legacy_product_ts_floor: row.get(4)?,
            }))
        },
    )
    .map_err(AppError::from)
}

struct StoredTemplate {
    title: String,
    notes: Option<String>,
    content: String,
}

fn select_stored_template(conn: &Connection, id: &str) -> Result<Option<StoredTemplate>, AppError> {
    conn.query_row(
        "SELECT title, notes, content FROM templates WHERE id = ?1",
        params![id],
        |row| {
            Ok(StoredTemplate {
                title: row.get(0)?,
                notes: row.get(1)?,
                content: row.get(2)?,
            })
        },
    )
    .optional()
    .map_err(AppError::from)
}

pub fn is_template_locked(db: &Database, id: &str) -> Result<bool, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM cards WHERE template_id = ?1",
                params![id],
                |row| row.get(0),
            )?;

            Ok(count > 0)
        })
    })
}

pub fn update_template(db: &Database, data: UpdateTemplateData) -> Result<Template, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        let original = get_template(db, &data.id)?.ok_or_else(|| {
            AppError::new(
                error_codes::NOT_FOUND_TEMPLATES_UPDATE_TEMPLATE,
                Some(format!("Template id: {}", data.id)),
            )
        })?;
        let is_locked = is_template_locked(db, &data.id)?;
        if is_locked {
            data.values.validate(Some(&original.content))?;
        } else {
            data.values.validate(None)?;
        }
        let now = get_current_timestamp()?;
        let title = normalize_required_title(&data.values.title);
        let notes = normalize_optional_notes(data.values.notes.clone());

        let content = serde_json::to_string(&data.values.content)?;

        db.with_transaction(|tx| {
            let stored = select_stored_template(tx, &data.id)?;
            tx.execute(
                r#"
                UPDATE templates
                SET
                    title = ?1,
                    content = ?2,
                    notes = ?3,
                    updated_at = ?4
                WHERE id = ?5
                "#,
                params![title, content, notes, now, data.id],
            )?;

            let Some(stored) = stored else {
                return Ok(());
            };
            let updated_at = Some(now);
            let mut capture = Capture::begin(tx)?;
            if stored.title != title {
                capture.write(
                    &data.id,
                    None,
                    &Payload::TemplateTitle(wire::Title { title, updated_at }),
                )?;
            }
            if stored.notes != notes {
                capture.write(
                    &data.id,
                    None,
                    &Payload::TemplateNotes(wire::Notes { notes, updated_at }),
                )?;
            }
            if stored.content != content {
                capture.write(
                    &data.id,
                    None,
                    &Payload::TemplateStructure(wire::JsonContent { content, updated_at }),
                )?;
            }

            Ok(())
        })?;

        get_template(db, &data.id)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))
    })
}

pub fn clone_template(db: &Database, data: CloneTemplateData) -> Result<Template, AppError> {
    throw_known_error(error_codes::DB_CLONE, || {
        let source = get_template(db, &data.source_id)?.ok_or_else(|| {
            AppError::new(
                error_codes::NOT_FOUND_TEMPLATES_CLONE_SOURCE,
                Some(format!("Template id: {}", data.source_id)),
            )
        })?;

        let insert_data = InsertTemplateData {
            title: data.title,
            content: source.content,
        };

        add_template(db, insert_data)
    })
}

pub fn delete_template(db: &Database, data: DeleteTemplateData) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_DELETE, || {
        db.with_transaction(|tx| {
            // INVARIANT: the learning default, locked templates, and templates referenced by a deck's
            // current template are not deletable (LEARNING-SETTINGS.md §Defaults, TEMPLATES.md §Deleting
            // Templates). UI disable is a convenience, not the enforcement.
            let is_default = settings::learning_defaults(tx)?.is_some_and(|d| d.template == data.id);
            if is_default {
                return Err(AppError::new(error_codes::VALIDATION_TEMPLATES_DELETE_DEFAULT, None));
            }

            let is_locked: bool = tx.query_row(
                "SELECT COUNT(*) > 0 FROM cards WHERE template_id = ?1",
                params![data.id],
                |row| row.get(0),
            )?;
            if is_locked {
                return Err(AppError::new(error_codes::VALIDATION_TEMPLATES_DELETE_LOCKED, None));
            }

            let has_decks: bool = tx.query_row(
                "SELECT COUNT(*) > 0 FROM decks WHERE template_id = ?1",
                params![data.id],
                |row| row.get(0),
            )?;
            if has_decks {
                return Err(AppError::new(error_codes::VALIDATION_TEMPLATES_DELETE_USED, None));
            }

            if select_stored_template(tx, &data.id)?.is_some() {
                Capture::begin(tx)?.delete(Kind::Templates, &data.id, None, None)?;
            }
            tx.execute("DELETE FROM templates WHERE id = ?1", params![data.id])?;
            Ok(())
        })
    })
}

pub fn get_template_decks(db: &Database, id: &str) -> Result<Vec<TemplateDeck>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                r#"
                SELECT id, title
                FROM decks
                WHERE template_id = ?1
                "#,
            )?;

            let decks = stmt
                .query_map(params![id], get_template_deck_row)?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(decks)
        })
    })
}
