import { AppError, throwKnownError } from "@koloda/app";
import type {
  Deck,
  LessonAmounts,
  LessonData,
  LessonDeck,
  LessonFilters,
  LessonResultData,
  LessonsResult,
} from "@koloda/srs";
import {
  cardRowSchema,
  convertTemplateToLessonTemplate,
  lessonAlgorithmRowSchema,
  lessonDeckSchema,
  lessonTemplateRowSchema,
  reviewRowSchema,
} from "@koloda/srs";
import { CARD_SELECT, REVIEW_SELECT } from "./columns";
import type { DB } from "./db";
import { getDecks } from "./decks";
import { parseRow, parseRows } from "./parse-rows";
import { FSRS_LEARNING, FSRS_NEW, FSRS_RELEARNING, FSRS_REVIEW, nowMs, placeholders } from "./sql";

function sumLessonAmounts(decks: LessonDeck[]): LessonAmounts {
  return decks.reduce<LessonAmounts>(
    (total, deck) => ({
      untouched: total.untouched + deck.untouched,
      learn: total.learn + deck.learn,
      review: total.review + deck.review,
      total: total.total + deck.total,
    }),
    { untouched: 0, learn: 0, review: 0, total: 0 },
  );
}

function lessonDeckFilter(column: string, deckIds: number[] | undefined, prefix: "WHERE" | "AND") {
  if (!deckIds?.length) return { sql: "", params: [] as unknown[] };
  return { sql: ` ${prefix} ${column} IN (${placeholders(deckIds.length)})`, params: [...deckIds] };
}

export async function getLessons(db: DB, dueAt: Date, filters: LessonFilters = {}): Promise<LessonsResult> {
  return throwKnownError("db.get", async () => {
    const { sql: filtersSQL, params: filterParams } = lessonDeckFilter("d.id", filters.deckIds, "WHERE");
    const result = await db.all(
      `WITH per_deck AS (
        SELECT
          d.id,
          d.title,
          COALESCE(SUM(CASE WHEN c.state = ${FSRS_NEW} THEN 1 END), 0) AS untouched,
          COALESCE(SUM(CASE WHEN c.state IN (${FSRS_LEARNING}, ${FSRS_RELEARNING}) AND c.due_at < ? THEN 1 END), 0) AS learn,
          COALESCE(SUM(CASE WHEN c.state = ${FSRS_REVIEW} AND c.due_at < ? THEN 1 END), 0) AS review
        FROM decks d
        LEFT JOIN cards c ON c.deck_id = d.id
        ${filtersSQL}
        GROUP BY d.id, d.title
      )
      SELECT id, title, untouched, learn, review,
             untouched + learn + review AS total
      FROM per_deck
      ORDER BY id`,
      [dueAt.getTime(), dueAt.getTime(), ...filterParams],
    );

    const lessonDecks = parseRows(lessonDeckSchema, result);
    return {
      total: sumLessonAmounts(lessonDecks),
      decks: lessonDecks,
    };
  });
}

export async function getLessonCards(db: DB, dueAt: Date, filters: LessonFilters, amounts: LessonAmounts) {
  return throwKnownError("db.get", async () => {
    const untouchedFilter = lessonDeckFilter("deck_id", filters.deckIds, "AND");
    const learnFilter = lessonDeckFilter("deck_id", filters.deckIds, "AND");
    const reviewFilter = lessonDeckFilter("deck_id", filters.deckIds, "AND");

    const params: unknown[] = [
      ...untouchedFilter.params,
      amounts.untouched,
      dueAt.getTime(),
      ...learnFilter.params,
      amounts.learn,
      dueAt.getTime(),
      ...reviewFilter.params,
      amounts.review,
    ];

    const rows = await db.all(
      `SELECT * FROM (
         SELECT ${CARD_SELECT}
         FROM cards
         WHERE state = ${FSRS_NEW}${untouchedFilter.sql}
         ORDER BY created_at
         LIMIT ?
       )

       UNION ALL

       SELECT * FROM (
         SELECT ${CARD_SELECT}
         FROM cards
         WHERE state IN (${FSRS_LEARNING}, ${FSRS_RELEARNING}) AND due_at < ?${learnFilter.sql}
         ORDER BY due_at
         LIMIT ?
       )

       UNION ALL

       SELECT * FROM (
         SELECT ${CARD_SELECT}
         FROM cards
         WHERE state = ${FSRS_REVIEW} AND due_at < ?${reviewFilter.sql}
         ORDER BY due_at
         LIMIT ?
       )`,
      params,
    );

    return parseRows(cardRowSchema, rows);
  });
}

export async function getLessonAlgorithms(db: DB, deckIds: Deck["id"][]) {
  return throwKnownError("db.get", async () => {
    if (!deckIds.length) return [];

    const result = await db.all(
      `SELECT DISTINCT a.id, a.content
       FROM algorithms a
       JOIN decks d ON d.algorithm_id = a.id
       WHERE d.id IN (${placeholders(deckIds.length)})`,
      deckIds,
    );

    return parseRows(lessonAlgorithmRowSchema, result);
  });
}

export async function getLessonTemplates(db: DB, deckIds: Deck["id"][]) {
  return throwKnownError("db.get", async () => {
    if (!deckIds.length) return [];

    const result = await db.all(
      `SELECT DISTINCT t.id, t.content
       FROM templates t
       JOIN decks d ON d.template_id = t.id
       WHERE d.id IN (${placeholders(deckIds.length)})`,
      deckIds,
    );
    const templates = parseRows(lessonTemplateRowSchema, result);

    return templates.map(convertTemplateToLessonTemplate);
  });
}

export async function getLessonData(
  db: DB,
  dueAt: Date,
  filters: LessonFilters,
  amounts: LessonAmounts,
): Promise<LessonData | null> {
  const lessonCards = await getLessonCards(db, dueAt, filters, amounts);
  // INVARIANT: empty match is `null`, not `{ cards: [], ... }`. Twin of Rust `get_lesson_data`
  // returning `None`. Spec: studying must not begin. `useLessonSession` treats only nullish
  // data as not ready — an empty object is truthy and would start studying with no current card.
  if (lessonCards.length === 0) return null;

  const deckIdsSet = new Set<number>();
  for (const { deckId } of lessonCards) deckIdsSet.add(deckId);
  const deckIds = Array.from(deckIdsSet);

  const lessonDecks = await getDecks(db, deckIds);
  const lessonTemplates = await getLessonTemplates(db, deckIds);
  const lessonAlgorithms = await getLessonAlgorithms(db, deckIds);

  return lessonDecks && lessonTemplates && lessonAlgorithms
    ? {
        cards: lessonCards,
        decks: lessonDecks,
        templates: lessonTemplates,
        algorithms: lessonAlgorithms,
      }
    : null;
}

export async function submitLessonResult(db: DB, { card, review }: LessonResultData) {
  if (card.id !== review.cardId) throw new AppError("validation.lessons.result.card-review-mismatch");

  return throwKnownError("db.update", async () => {
    return db.transaction(async (tx) => {
      await tx.run(
        `UPDATE cards
         SET state = ?, due_at = ?, stability = ?, difficulty = ?,
             scheduled_days = ?, learning_steps = ?, reps = ?, lapses = ?,
             last_reviewed_at = ?
         WHERE id = ?`,
        [
          card.state,
          card.dueAt ?? null,
          card.stability,
          card.difficulty,
          card.scheduledDays,
          card.learningSteps,
          card.reps,
          card.lapses,
          card.lastReviewedAt ?? null,
          card.id,
        ],
      );

      const inserted = await tx.run(
        `INSERT INTO reviews (card_id, rating, state, due_at, stability, difficulty,
                              scheduled_days, learning_steps, time, is_ignored, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          review.cardId,
          review.rating,
          review.state,
          review.dueAt,
          review.stability,
          review.difficulty,
          review.scheduledDays,
          review.learningSteps,
          review.time,
          review.isIgnored,
          review.createdAt?.getTime() ?? nowMs(),
        ],
      );

      const result = await tx.get(`SELECT ${REVIEW_SELECT} FROM reviews WHERE id = ? LIMIT 1`, [
        inserted.lastInsertRowid,
      ]);
      return parseRow(reviewRowSchema, result, { bigintId: true });
    });
  });
}
