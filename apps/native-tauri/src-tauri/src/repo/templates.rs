use rusqlite::{params, OptionalExtension};

use crate::app::db::Database;
use crate::app::error::{error_codes, AppError};
use crate::app::utility::get_current_timestamp;
use crate::domain::templates::{
    CloneTemplateData, DeleteTemplateData, InsertTemplateData, Template, TemplateContent, TemplateDeck,
    UpdateTemplateData,
};

fn get_template_row(row: &rusqlite::Row<'_>) -> Result<Template, rusqlite::Error> {
    let content_str: String = row.get(2)?;
    let content: TemplateContent = serde_json::from_str(&content_str).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(content_str.len(), rusqlite::types::Type::Text, Box::new(e))
    })?;

    Ok(Template {
        id: row.get(0)?,
        title: row.get(1)?,
        content,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        is_locked: row.get(5)?,
    })
}

fn get_template_deck_row(row: &rusqlite::Row<'_>) -> Result<TemplateDeck, rusqlite::Error> {
    Ok(TemplateDeck {
        id: row.get(0)?,
        title: row.get(1)?,
    })
}

pub fn get_templates(db: &Database) -> Result<Vec<Template>, AppError> {
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
                ) as is_locked
            FROM templates t
            ORDER BY t.created_at
            "#,
        )?;

        let templates = stmt.query_map([], get_template_row)?.collect::<Result<Vec<_>, _>>()?;

        Ok(templates)
    })
}

pub fn get_template(db: &Database, id: i64) -> Result<Option<Template>, AppError> {
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
                ) as is_locked
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
}

pub fn add_template(db: &Database, data: InsertTemplateData) -> Result<Template, AppError> {
    data.validate()?;
    let now = get_current_timestamp()?;

    let id = db.with_conn(|conn| {
        conn.execute(
            r#"
            INSERT INTO templates (title, content, created_at, updated_at)
            VALUES (?1, ?2, ?3, NULL)
            "#,
            params![data.title, serde_json::to_string(&data.content)?, now],
        )?;

        Ok(conn.last_insert_rowid())
    })?;

    get_template(db, id)?.ok_or_else(|| AppError::new(error_codes::DB_ADD, None))
}

pub fn is_template_locked(db: &Database, id: i64) -> Result<bool, AppError> {
    db.with_conn(|conn| {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM cards WHERE template_id = ?1",
            params![id],
            |row| row.get(0),
        )?;

        Ok(count > 0)
    })
}

pub fn update_template(db: &Database, data: UpdateTemplateData) -> Result<Template, AppError> {
    let original = get_template(db, data.id)?.ok_or_else(|| {
        AppError::new(
            error_codes::NOT_FOUND_CARDS_UPDATE_TEMPLATE,
            Some(format!("Template id: {}", data.id)),
        )
    })?;
    let is_locked = is_template_locked(db, data.id)?;
    if is_locked {
        data.values.validate(Some(&original.content))?;
    } else {
        data.values.validate(None)?;
    }
    let now = get_current_timestamp()?;

    db.with_conn(|conn| {
        conn.execute(
            r#"
            UPDATE templates
            SET
                title = ?1,
                content = ?2,
                updated_at = ?3
            WHERE id = ?4
            "#,
            params![
                data.values.title,
                serde_json::to_string(&data.values.content)?,
                now,
                data.id
            ],
        )?;

        Ok(())
    })?;

    get_template(db, data.id)?.ok_or_else(|| AppError::new(error_codes::DB_UPDATE, None))
}

pub fn clone_template(db: &Database, data: CloneTemplateData) -> Result<Template, AppError> {
    let source = get_template(db, data.source_id)?.ok_or_else(|| {
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
}

pub fn delete_template(db: &Database, data: DeleteTemplateData) -> Result<(), AppError> {
    let is_locked = is_template_locked(db, data.id)?;
    if is_locked {
        return Err(AppError::new(error_codes::VALIDATION_TEMPLATES_DELETE_LOCKED, None));
    }

    db.with_conn(|conn| {
        conn.execute("DELETE FROM templates WHERE id = ?1", params![data.id])?;
        Ok(())
    })
}

pub fn get_template_decks(db: &Database, id: i64) -> Result<Vec<TemplateDeck>, AppError> {
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
}
