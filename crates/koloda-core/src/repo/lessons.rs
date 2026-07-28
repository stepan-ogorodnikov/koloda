use rusqlite::Row;

use crate::app::db::Database;
use crate::app::error::AppError;
use crate::app::utility::get_current_timestamp;
use crate::domain::cards::Card;
use crate::domain::lessons::{
    GetLessonDataParams, GetLessonsParams, LessonAmounts, LessonData, LessonDeck, LessonResultData, LessonTemplate,
    LessonTemplateLayoutItem, LessonsResult,
};
use crate::repo::cards::get_card_row;

fn get_lesson_deck_row(row: &Row) -> Result<LessonDeck, rusqlite::Error> {
    Ok(LessonDeck {
        id: row.get(0)?,
        title: row.get(1)?,
        untouched: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
        learn: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
        review: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
        total: row.get::<_, Option<i64>>(5)?.unwrap_or(0),
    })
}

fn sum_lesson_amounts(decks: &[LessonDeck]) -> LessonAmounts {
    let mut total = LessonAmounts::default();
    for deck in decks {
        total.untouched += deck.untouched;
        total.learn += deck.learn;
        total.review += deck.review;
        total.total += deck.total;
    }
    total
}

pub fn get_lessons(db: &Database, params: GetLessonsParams) -> Result<LessonsResult, AppError> {
    db.with_conn(|conn| {
        let deck_ids = params
            .filters
            .as_ref()
            .and_then(|f| f.deck_ids.as_deref())
            .filter(|ids| !ids.is_empty());
        let mut next_param = 1;
        let (filters, mut query_params) = lesson_deck_filter_sql("d.id", deck_ids, &mut next_param, "WHERE");
        let due_at_param = format!("?{}", next_param);
        query_params.push(params.due_at);

        let query = format!(
            r#"
            WITH per_deck AS (
                SELECT
                    d.id,
                    d.title,
                    COALESCE(SUM(CASE WHEN c.state = 0 THEN 1 END), 0) AS untouched,
                    COALESCE(SUM(CASE WHEN c.state IN (1, 3) AND c.due_at < {due_at_param} THEN 1 END), 0) AS learn,
                    COALESCE(SUM(CASE WHEN c.state = 2 AND c.due_at < {due_at_param} THEN 1 END), 0) AS review
                FROM decks d
                LEFT JOIN cards c ON c.deck_id = d.id
                {filters}
                GROUP BY d.id, d.title
            )
            SELECT id, title, untouched, learn, review, untouched + learn + review AS total
            FROM per_deck
            ORDER BY id
            "#,
        );

        let sql_params: Vec<&dyn rusqlite::ToSql> =
            query_params.iter().map(|value| value as &dyn rusqlite::ToSql).collect();
        let mut stmt = conn.prepare(&query)?;
        let decks = stmt
            .query_map(sql_params.as_slice(), get_lesson_deck_row)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(LessonsResult {
            total: sum_lesson_amounts(&decks),
            decks,
        })
    })
}

pub fn get_lesson_cards(db: &Database, params: &GetLessonDataParams) -> Result<Vec<Card>, AppError> {
    db.with_conn(|conn| {
        let deck_ids = params.filters.deck_ids.as_deref().filter(|ids| !ids.is_empty());
        let mut next_param = 1;
        let mut query_params: Vec<i64> = Vec::new();

        let (filters_untouched, untouched_deck_params) =
            lesson_deck_filter_sql("deck_id", deck_ids, &mut next_param, "AND");
        query_params.extend(untouched_deck_params);
        let limit_untouched_param = {
            let placeholder = format!("?{}", next_param);
            next_param += 1;
            placeholder
        };
        query_params.push(params.amounts.untouched);

        let due_at_param = {
            let placeholder = format!("?{}", next_param);
            next_param += 1;
            placeholder
        };
        query_params.push(params.due_at);

        let (filters_learn, learn_deck_params) =
            lesson_deck_filter_sql("deck_id", deck_ids, &mut next_param, "AND");
        query_params.extend(learn_deck_params);
        let limit_learn_param = {
            let placeholder = format!("?{}", next_param);
            next_param += 1;
            placeholder
        };
        query_params.push(params.amounts.learn);

        let (filters_review, review_deck_params) =
            lesson_deck_filter_sql("deck_id", deck_ids, &mut next_param, "AND");
        query_params.extend(review_deck_params);
        let limit_review_param = format!("?{}", next_param);
        query_params.push(params.amounts.review);

        let query = format!(
            r#"
            SELECT * FROM (
                SELECT id, deck_id, template_id, content, state, due_at, stability, difficulty,
                       scheduled_days, learning_steps, reps, lapses, last_reviewed_at,
                       created_at, updated_at
                FROM cards
                WHERE state = 0{filters_untouched}
                ORDER BY created_at
                LIMIT {limit_untouched_param}
            )

            UNION ALL

            SELECT * FROM (
                SELECT id, deck_id, template_id, content, state, due_at, stability, difficulty,
                       scheduled_days, learning_steps, reps, lapses, last_reviewed_at,
                       created_at, updated_at
                FROM cards
                WHERE state IN (1, 3) AND due_at < {due_at_param} {filters_learn}
                ORDER BY due_at
                LIMIT {limit_learn_param}
            )

            UNION ALL

            SELECT * FROM (
                SELECT id, deck_id, template_id, content, state, due_at, stability, difficulty,
                       scheduled_days, learning_steps, reps, lapses, last_reviewed_at,
                       created_at, updated_at
                FROM cards
                WHERE state = 2 AND due_at < {due_at_param} {filters_review}
                ORDER BY due_at
                LIMIT {limit_review_param}
            )
            "#,
        );

        let sql_params: Vec<&dyn rusqlite::ToSql> =
            query_params.iter().map(|value| value as &dyn rusqlite::ToSql).collect();
        let mut stmt = conn.prepare(&query)?;

        let cards = stmt
            .query_map(sql_params.as_slice(), get_card_row)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(cards)
    })
}

fn unique_ids_in_order(ids: impl IntoIterator<Item = i64>) -> Vec<i64> {
    let mut seen = std::collections::HashSet::new();
    ids.into_iter().filter(|id| seen.insert(*id)).collect()
}

fn template_to_lesson_template(t: crate::domain::templates::Template) -> LessonTemplate {
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
}

pub fn get_lesson_data(db: &Database, params: &GetLessonDataParams) -> Result<Option<LessonData>, AppError> {
    let cards = get_lesson_cards(db, params)?;

    if cards.is_empty() {
        return Ok(None);
    }

    let unique_deck_ids: Vec<i64> = unique_ids_in_order(cards.iter().map(|c| c.deck_id));

    let lesson_decks = crate::repo::decks::get_decks_by_ids(db, &unique_deck_ids)?;

    let template_ids = unique_ids_in_order(lesson_decks.iter().map(|d| d.template_id));
    let templates_by_id = crate::repo::templates::get_templates_by_ids(db, &template_ids)?;
    let lesson_templates: Vec<LessonTemplate> = template_ids
        .iter()
        .filter_map(|id| templates_by_id.get(id).cloned())
        .map(template_to_lesson_template)
        .collect();

    let algorithm_ids = unique_ids_in_order(lesson_decks.iter().map(|d| d.algorithm_id));
    let algorithms_by_id: std::collections::HashMap<i64, _> =
        crate::repo::algorithms::get_algorithms_by_ids(db, &algorithm_ids)?
            .into_iter()
            .map(|a| (a.id, a))
            .collect();
    let lesson_algorithms: Vec<_> = algorithm_ids
        .iter()
        .filter_map(|id| algorithms_by_id.get(id).cloned())
        .collect();

    Ok(Some(LessonData {
        cards,
        decks: lesson_decks,
        templates: lesson_templates,
        algorithms: lesson_algorithms,
    }))
}

pub fn submit_lesson_result(db: &Database, data: LessonResultData) -> Result<(), AppError> {
    data.validate()?;

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
                                scheduled_days, learning_steps, time, is_ignored, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
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
                data.review.time,
                data.review.is_ignored,
                now
            ],
        )?;

        Ok(())
    })
}

fn lesson_deck_filter_sql(
    column: &str,
    deck_ids: Option<&[i64]>,
    next_param: &mut i32,
    prefix: &str,
) -> (String, Vec<i64>) {
    let Some(ids) = deck_ids.filter(|ids| !ids.is_empty()) else {
        return (String::new(), Vec::new());
    };

    let placeholders: Vec<String> = ids
        .iter()
        .map(|_| {
            let placeholder = format!("?{}", *next_param);
            *next_param += 1;
            placeholder
        })
        .collect();

    (
        format!(" {prefix} {column} IN ({})", placeholders.join(", ")),
        ids.to_vec(),
    )
}
