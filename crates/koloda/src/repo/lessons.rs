use rusqlite::Row;

use crate::app::db::{parse_json_column, Database};
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::app::utility::get_current_timestamp;
use crate::domain::algorithms_fsrs::AlgorithmFSRS;
use crate::domain::cards::Card;
use crate::domain::lessons::{
    GetLessonDataParams, GetLessonsParams, LessonAlgorithm, LessonAmounts, LessonData, LessonDeck, LessonResultData,
    LessonTemplate, LessonTemplateLayoutItem, LessonsResult,
};
use crate::repo::cards::get_card_row;
use crate::repo::fsrs_sql;
use crate::repo::reviews;

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
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let deck_ids = params
                .filters
                .as_ref()
                .and_then(|f| f.deck_ids.as_deref())
                .filter(|ids| !ids.is_empty());
            let mut next_param = 1;
            let (filters, mut query_params) = lesson_deck_filter_sql("d.id", deck_ids, &mut next_param, "WHERE");
            let due_at_param = format!("?{}", next_param);
            query_params.push(rusqlite::types::Value::Integer(params.due_at));

            let query = format!(
                r#"
            WITH per_deck AS (
                SELECT
                    d.id,
                    d.title,
                    COALESCE(SUM(CASE WHEN {untouched} THEN 1 END), 0) AS untouched,
                    COALESCE(SUM(CASE WHEN {learn_due} THEN 1 END), 0) AS learn,
                    COALESCE(SUM(CASE WHEN {review_due} THEN 1 END), 0) AS review
                FROM decks d
                LEFT JOIN cards c ON c.deck_id = d.id
                {filters}
                GROUP BY d.id, d.title
            )
            SELECT id, title, untouched, learn, review, untouched + learn + review AS total
            FROM per_deck
            ORDER BY id
            "#,
                untouched = fsrs_sql::eq_new("c.state"),
                learn_due = format_args!("{} AND c.due_at < {}", fsrs_sql::in_learn("c.state"), due_at_param),
                review_due = format_args!("{} AND c.due_at < {}", fsrs_sql::eq_review("c.state"), due_at_param),
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
    })
}

pub fn get_lesson_cards(db: &Database, params: &GetLessonDataParams) -> Result<Vec<Card>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        params.validate()?;

        db.with_conn(|conn| {
            let deck_ids = params.filters.deck_ids.as_deref().filter(|ids| !ids.is_empty());
            let mut next_param = 1;
            let mut query_params: Vec<rusqlite::types::Value> = Vec::new();

            let (filters_untouched, untouched_deck_params) =
                lesson_deck_filter_sql("deck_id", deck_ids, &mut next_param, "AND");
            query_params.extend(untouched_deck_params);
            let limit_untouched_param = {
                let placeholder = format!("?{}", next_param);
                next_param += 1;
                placeholder
            };
            query_params.push(rusqlite::types::Value::Integer(params.amounts.untouched));

            let due_at_param = {
                let placeholder = format!("?{}", next_param);
                next_param += 1;
                placeholder
            };
            query_params.push(rusqlite::types::Value::Integer(params.due_at));

            let (filters_learn, learn_deck_params) =
                lesson_deck_filter_sql("deck_id", deck_ids, &mut next_param, "AND");
            query_params.extend(learn_deck_params);
            let limit_learn_param = {
                let placeholder = format!("?{}", next_param);
                next_param += 1;
                placeholder
            };
            query_params.push(rusqlite::types::Value::Integer(params.amounts.learn));

            let (filters_review, review_deck_params) =
                lesson_deck_filter_sql("deck_id", deck_ids, &mut next_param, "AND");
            query_params.extend(review_deck_params);
            let limit_review_param = format!("?{}", next_param);
            query_params.push(rusqlite::types::Value::Integer(params.amounts.review));

            let query = format!(
                r#"
            SELECT * FROM (
                SELECT id, deck_id, template_id, content, state, due_at, stability, difficulty,
                       scheduled_days, learning_steps, reps, lapses, last_reviewed_at,
                       created_at, updated_at
                FROM cards
                WHERE {untouched}{filters_untouched}
                ORDER BY created_at
                LIMIT {limit_untouched_param}
            )

            UNION ALL

            SELECT * FROM (
                SELECT id, deck_id, template_id, content, state, due_at, stability, difficulty,
                       scheduled_days, learning_steps, reps, lapses, last_reviewed_at,
                       created_at, updated_at
                FROM cards
                WHERE {learn_due}{filters_learn}
                ORDER BY due_at
                LIMIT {limit_learn_param}
            )

            UNION ALL

            SELECT * FROM (
                SELECT id, deck_id, template_id, content, state, due_at, stability, difficulty,
                       scheduled_days, learning_steps, reps, lapses, last_reviewed_at,
                       created_at, updated_at
                FROM cards
                WHERE {review_due}{filters_review}
                ORDER BY due_at
                LIMIT {limit_review_param}
            )
            "#,
                untouched = fsrs_sql::eq_new("state"),
                learn_due = format_args!("{} AND due_at < {}", fsrs_sql::in_learn("state"), due_at_param),
                review_due = format_args!("{} AND due_at < {}", fsrs_sql::eq_review("state"), due_at_param),
            );

            let sql_params: Vec<&dyn rusqlite::ToSql> =
                query_params.iter().map(|value| value as &dyn rusqlite::ToSql).collect();
            let mut stmt = conn.prepare(&query)?;

            let cards = stmt
                .query_map(sql_params.as_slice(), get_card_row)?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(cards)
        })
    })
}

fn unique_ids_in_order<'a>(ids: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    ids.into_iter()
        .filter(|id| seen.insert(*id))
        .map(str::to_string)
        .collect()
}

fn lesson_layout(content: &crate::domain::templates::TemplateContent) -> Vec<LessonTemplateLayoutItem> {
    content
        .layout
        .iter()
        .map(|item| {
            let field = content.fields.iter().find(|f| f.id == item.field).cloned();
            LessonTemplateLayoutItem {
                field,
                operation: item.operation.clone(),
                field_id: item.field.clone(),
            }
        })
        .collect()
}

// Twin of web `getLessonTemplates` (`libs/db-sqlite/src/lib/lessons.ts`): one DISTINCT join over
// the lesson decks, `id` + `content` only — everything else is derived from content.
fn get_lesson_templates(db: &Database, deck_ids: &[String]) -> Result<Vec<LessonTemplate>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        if deck_ids.is_empty() {
            return Ok(Vec::new());
        }

        let placeholders: Vec<String> = deck_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect();
        let sql = format!(
            r#"
            SELECT DISTINCT t.id, t.content
            FROM templates t
            JOIN decks d ON d.template_id = t.id
            WHERE d.id IN ({})
            "#,
            placeholders.join(", ")
        );

        db.with_conn(|conn| {
            let params: Vec<&dyn rusqlite::ToSql> = deck_ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
            let mut stmt = conn.prepare(&sql)?;
            let templates = stmt
                .query_map(params.as_slice(), |row| {
                    let content_str: String = row.get(1)?;
                    let content: crate::domain::templates::TemplateContent = parse_json_column(1, &content_str)?;

                    Ok(LessonTemplate {
                        id: row.get(0)?,
                        layout: lesson_layout(&content),
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(templates)
        })
    })
}

// Twin of web `getLessonAlgorithms` (`libs/db-sqlite/src/lib/lessons.ts`): one DISTINCT join over
// the lesson decks, `id` + `content` only — grading reads content alone.
fn get_lesson_algorithms(db: &Database, deck_ids: &[String]) -> Result<Vec<LessonAlgorithm>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        if deck_ids.is_empty() {
            return Ok(Vec::new());
        }

        let placeholders: Vec<String> = deck_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect();
        let sql = format!(
            r#"
            SELECT DISTINCT a.id, a.content
            FROM algorithms a
            JOIN decks d ON d.algorithm_id = a.id
            WHERE d.id IN ({})
            "#,
            placeholders.join(", ")
        );

        db.with_conn(|conn| {
            let params: Vec<&dyn rusqlite::ToSql> = deck_ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
            let mut stmt = conn.prepare(&sql)?;
            let algorithms = stmt
                .query_map(params.as_slice(), |row| {
                    let content_str: String = row.get(1)?;
                    let content: AlgorithmFSRS = parse_json_column(1, &content_str)?;

                    Ok(LessonAlgorithm {
                        id: row.get(0)?,
                        content,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(algorithms)
        })
    })
}

pub fn get_lesson_data(db: &Database, params: &GetLessonDataParams) -> Result<Option<LessonData>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        let cards = get_lesson_cards(db, params)?;

        // INVARIANT: empty match is `None`, not an empty `LessonData`. Twin of web SQLite `null`.
        // NAPI/IPC is `Option` / `LessonData | null`. Spec: studying must not begin.
        if cards.is_empty() {
            return Ok(None);
        }

        let unique_deck_ids = unique_ids_in_order(cards.iter().map(|c| c.deck_id.as_str()));

        let lesson_decks = crate::repo::decks::get_decks_by_ids(db, &unique_deck_ids)?;

        let lesson_templates = get_lesson_templates(db, &unique_deck_ids)?;
        let lesson_algorithms = get_lesson_algorithms(db, &unique_deck_ids)?;

        Ok(Some(LessonData {
            cards,
            decks: lesson_decks,
            templates: lesson_templates,
            algorithms: lesson_algorithms,
        }))
    })
}

pub fn submit_lesson_result(db: &Database, data: LessonResultData) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
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

            // WHY: review INSERT SQL lives in `reviews::insert_review` — single home for
            // review writes so future writers reuse the same statement.
            reviews::insert_review(tx, &data.review, now)?;

            Ok(())
        })
    })
}

fn lesson_deck_filter_sql(
    column: &str,
    deck_ids: Option<&[String]>,
    next_param: &mut i32,
    prefix: &str,
) -> (String, Vec<rusqlite::types::Value>) {
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
        ids.iter().map(|id| rusqlite::types::Value::Text(id.clone())).collect(),
    )
}
