use rusqlite::Row;

use crate::app::db::Database;
use crate::app::error::AppError;
use crate::app::utility::get_current_timestamp;
use crate::domain::cards::Card;
use crate::domain::decks::Deck;
use crate::domain::lessons::{
    GetLessonDataParams, GetLessonsParams, Lesson, LessonData, LessonFilters, LessonResultData, LessonTemplate,
    LessonTemplateLayoutItem,
};
use crate::repo::cards::get_card_row;

fn get_lesson_row(row: &Row) -> Result<Lesson, rusqlite::Error> {
    Ok(Lesson {
        id: row.get(0)?,
        title: row.get(1)?,
        untouched: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
        learn: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
        review: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
        total: row.get::<_, Option<i64>>(5)?.unwrap_or(0),
    })
}

pub fn get_lessons(db: &Database, params: GetLessonsParams) -> Result<Vec<Lesson>, AppError> {
    db.with_conn(|conn| {
        let filters = get_lesson_filters_sql("d.id", params.filters.as_ref());
        let due_at = params.due_at;

        let query = format!(
            r#"
            WITH per_deck AS (
                SELECT
                    d.id,
                    d.title,
                    COALESCE(SUM(CASE WHEN c.state = 0 THEN 1 END), 0) AS untouched,
                    COALESCE(SUM(CASE WHEN c.state IN (1, 3) AND c.due_at < {} THEN 1 END), 0) AS learn,
                    COALESCE(SUM(CASE WHEN c.state = 2 AND c.due_at < {} THEN 1 END), 0) AS review
                FROM decks d
                LEFT JOIN cards c ON c.deck_id = d.id
                {}
                GROUP BY d.id, d.title
            )
            SELECT id, title, untouched, learn, review, untouched + learn + review AS total
            FROM per_deck

            UNION ALL

            SELECT NULL, NULL, COALESCE(SUM(untouched), 0), COALESCE(SUM(learn), 0), COALESCE(SUM(review), 0),
                   COALESCE(SUM(untouched), 0) + COALESCE(SUM(learn), 0) + COALESCE(SUM(review), 0)
            FROM per_deck
            ORDER BY id
            "#,
            due_at, due_at, filters
        );

        let mut stmt = conn.prepare(&query)?;
        let lessons = stmt.query_map([], get_lesson_row)?.collect::<Result<Vec<_>, _>>()?;

        Ok(lessons)
    })
}

pub fn get_lesson_cards(db: &Database, params: &GetLessonDataParams) -> Result<Vec<Card>, AppError> {
    db.with_conn(|conn| {
        let filters = get_lesson_filters_sql("deck_id", Some(&params.filters));

        let query = format!(
            r#"
            SELECT * FROM (
                SELECT id, deck_id, template_id, content, state, due_at, stability, difficulty,
                       scheduled_days, learning_steps, reps, lapses, last_reviewed_at,
                       created_at, updated_at
                FROM cards
                WHERE state = 0{}
                ORDER BY created_at
                LIMIT {}
            )

            UNION ALL

            SELECT * FROM (
                SELECT id, deck_id, template_id, content, state, due_at, stability, difficulty,
                       scheduled_days, learning_steps, reps, lapses, last_reviewed_at,
                       created_at, updated_at
                FROM cards
                WHERE state IN (1, 3) AND due_at < {} {}
                ORDER BY due_at
                LIMIT {}
            )

            UNION ALL

            SELECT * FROM (
                SELECT id, deck_id, template_id, content, state, due_at, stability, difficulty,
                       scheduled_days, learning_steps, reps, lapses, last_reviewed_at,
                       created_at, updated_at
                FROM cards
                WHERE state = 2 AND due_at < {} {}
                ORDER BY due_at
                LIMIT {}
            )
            "#,
            filters,
            params.amounts.untouched,
            params.due_at,
            filters,
            params.amounts.learn,
            params.due_at,
            filters,
            params.amounts.review
        );

        let mut stmt = conn.prepare(&query)?;

        let cards = stmt.query_map([], get_card_row)?.collect::<Result<Vec<_>, _>>()?;

        Ok(cards)
    })
}

pub fn get_lesson_data(db: &Database, params: &GetLessonDataParams) -> Result<Option<LessonData>, AppError> {
    let cards = get_lesson_cards(db, params)?;

    if cards.is_empty() {
        return Ok(None);
    }

    let deck_ids: Vec<i64> = cards.iter().map(|c| c.deck_id).collect();
    let unique_deck_ids: Vec<i64> = deck_ids
        .into_iter()
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    let decks = crate::repo::decks::get_decks(db)?;
    let lesson_decks: Vec<Deck> = decks.into_iter().filter(|d| unique_deck_ids.contains(&d.id)).collect();

    let templates = crate::repo::templates::get_templates(db)?;
    let lesson_templates: Vec<LessonTemplate> = templates
        .into_iter()
        .filter(|t| lesson_decks.iter().any(|d| d.template_id == t.id))
        .map(|t| {
            let layout: Vec<LessonTemplateLayoutItem> = t
                .content
                .layout
                .iter()
                .map(|item| {
                    let field = t.content.fields.iter().find(|f| f.id == item.field).cloned();
                    LessonTemplateLayoutItem {
                        field,
                        operation: item.operation.clone(),
                        field_id: item.field,
                    }
                })
                .collect();
            LessonTemplate {
                id: t.id,
                title: t.title,
                fields: t.content.fields,
                layout,
                created_at: t.created_at,
                updated_at: t.updated_at,
            }
        })
        .collect();

    let algorithms = crate::repo::algorithms::get_algorithms(db)?;
    let lesson_algorithms = algorithms
        .into_iter()
        .filter(|a| lesson_decks.iter().any(|d| d.algorithm_id == a.id))
        .collect();

    Ok(Some(LessonData {
        cards,
        decks: lesson_decks,
        templates: lesson_templates,
        algorithms: lesson_algorithms,
    }))
}

pub fn submit_lesson_result(db: &Database, data: LessonResultData) -> Result<(), AppError> {
    let now = get_current_timestamp()?;

    db.with_transaction(|tx| {
        tx.execute(
            r#"
            UPDATE cards
            SET state = ?1, due_at = ?2, stability = ?3, difficulty = ?4,
                scheduled_days = ?5, learning_steps = ?6, reps = ?7, lapses = ?8,
                last_reviewed_at = ?9
            WHERE id = ?10
            "#,
            rusqlite::params![
                data.card.state,
                data.card.due_at,
                data.card.stability,
                data.card.difficulty,
                data.card.scheduled_days,
                data.card.learning_steps,
                data.card.reps,
                data.card.lapses,
                data.card.last_reviewed_at,
                data.card.id
            ],
        )?;

        tx.execute(
            r#"
            INSERT INTO reviews (card_id, rating, state, due_at, stability, difficulty,
                                scheduled_days, learning_steps, is_ignored, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
            rusqlite::params![
                data.review.card_id,
                data.review.rating,
                data.review.state,
                data.review.due_at,
                data.review.stability,
                data.review.difficulty,
                data.review.scheduled_days,
                data.review.learning_steps,
                data.review.is_ignored,
                now
            ],
        )?;

        Ok(())
    })
}

fn get_lesson_filters_sql(column: &str, filters: Option<&LessonFilters>) -> String {
    if let Some(deck_ids) = filters.and_then(|f| f.deck_ids.as_ref()).filter(|ids| !ids.is_empty()) {
        let ids_str: Vec<String> = deck_ids.iter().map(|id| id.to_string()).collect();
        format!(" AND {} IN ({})", column, ids_str.join(", "))
    } else {
        String::new()
    }
}
