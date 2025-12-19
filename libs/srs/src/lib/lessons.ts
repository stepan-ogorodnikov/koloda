import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import type { Algorithm } from "./algorithms";
import type { Card } from "./cards";
import { handleDBError } from "./db";
import type { DB } from "./db";
import type { Deck } from "./decks";
import { getDecks } from "./decks";
import type { InsertReviewData, Review } from "./reviews";
import { cards, decks, reviews } from "./schema";
import type { Template, TemplateField, TemplateLayoutItem } from "./templates";
import type { Modify } from "./utility";

export const LESSON_TYPES = ["untouched", "learn", "review", "total"] as const;

export const LESSON_TYPE_LABELS: Record<LessonType, MessageDescriptor> = {
  untouched: msg`lesson.init.labels.untouched`,
  learn: msg`lesson.init.labels.learn`,
  review: msg`lesson.init.labels.review`,
  total: msg`lesson.init.labels.total`,
} as const;

export type LessonType = typeof LESSON_TYPES[number];

export type Lesson = Record<LessonType, number> & {
  id: Deck["id"] | null;
  title: Deck["title"];
};

export type LessonFilters = { deckIds?: (Deck["id"] | string)[] };

/**
 * Retrieves lesson card counts ready to learn by type (untouched, learn, review, total) for decks
 * @param db - The database instance
 * @param dueAt - The timestamp to check card due status against
 * @param filters - Optional filters to apply to the query
 * @returns Array of objects with counts per deck where the first row is sum of the rest of the rows
 */
export async function getLessons(db: DB, dueAt: Date, filters: LessonFilters = {}) {
  try {
    const filtersSQL = filters.deckIds?.length
      ? sql`WHERE d.id IN (${sql.join(filters.deckIds.map(id => sql`${id}`), sql`, `)})`
      : sql``;

    const result = await db.execute(sql`
       WITH per_deck AS (
        SELECT
          d.id,
          d.title,
          COALESCE(SUM(CASE WHEN c.state = 0 THEN 1 END), 0) AS untouched,
          COALESCE(SUM(CASE WHEN c.state IN (1,3) AND c.due_at < ${dueAt} THEN 1 END), 0) AS learn,
          COALESCE(SUM(CASE WHEN c.state = 2 AND c.due_at < ${dueAt} THEN 1 END), 0) AS review
        FROM decks d
        LEFT JOIN cards c ON c.deck_id = d.id
        ${filtersSQL}
        GROUP BY d.id, d.title
      )
      SELECT id, title, untouched, learn, review,
             untouched + learn + review AS total
      FROM per_deck

      UNION ALL

      SELECT NULL, NULL, SUM(untouched), SUM(learn), SUM(review),
             SUM(untouched) + SUM(learn) + SUM(review)
      FROM per_deck
      ORDER BY id NULLS FIRST
    `);
    return result.rows as Lesson[];
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export type LessonAmounts = Record<LessonType, number>;
export type LessonCard = Pick<Card, "id" | "state" | "content" | "deckId">;

/**
 * Retrieves cards for a lesson based on due time, filters and amounts
 * @param db - The database instance
 * @param dueAt - The date to check card due status against
 * @param filters - Filters to apply to the query
 * @param amounts - The number of cards to retrieve for each lesson type
 * @returns Array of cards for the lesson
 */
export async function getLessonCards(
  db: DB,
  dueAt: Date,
  filters: LessonFilters,
  amounts: LessonAmounts,
) {
  try {
    const deckFilter = filters.deckIds?.length ? inArray(cards.deckId, filters.deckIds.map(Number)) : undefined;

    const untouched = db
      .select()
      .from(cards)
      .where(and(eq(cards.state, 0), deckFilter))
      .orderBy(asc(cards.createdAt))
      .limit(amounts.untouched);

    const learn = db
      .select()
      .from(cards)
      .where(and(inArray(cards.state, [1, 3]), lt(cards.dueAt, dueAt), deckFilter))
      .orderBy(asc(cards.dueAt))
      .limit(amounts.learn);

    const review = db
      .select()
      .from(cards)
      .where(and(eq(cards.state, 2), lt(cards.dueAt, dueAt), deckFilter))
      .orderBy(asc(cards.dueAt))
      .limit(amounts.review);

    return unionAll(untouched, learn, review) as unknown as Card[];
  } catch (e) {
    handleDBError(e);
    return;
  }
}

/**
 * Retrieves the algorithms used by given decks
 * @param db - The database instance
 * @param deckIds - Array of deck IDs to retrieve algorithms for
 * @returns Array of algorithms used by the specified decks
 */
export async function getLessonAlgorithms(db: DB, deckIds: Deck["id"][]) {
  try {
    if (!deckIds.length) return Promise.resolve([]);

    const result = await db.execute(sql`
      SELECT DISTINCT a.id, a.content
      FROM algorithms a
      JOIN decks d ON d.algorithm_id = a.id
      WHERE d.id IN (${sql.join(deckIds.map(id => sql`${id}`), sql`, `)})
    `);
    return result.rows as Algorithm[];
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export type LessonTemplateLayoutItem = Modify<TemplateLayoutItem, {
  field: TemplateField | undefined;
}>;

export type LessonTemplate = Modify<Template, {
  layout: LessonTemplateLayoutItem[];
}>;

/**
 * Retrieves the templates used by given decks
 * @param db - The database instance
 * @param deckIds - Array of deck IDs to retrieve templates for
 * @returns Array of templates used by the specified decks
 */
export async function getLessonTemplates(db: DB, deckIds: Deck["id"][]) {
  try {
    if (!deckIds.length) return Promise.resolve([]);

    const result = await db.execute(sql`
      SELECT DISTINCT t.id, t.content
      FROM templates t
      JOIN decks d ON d.template_id = t.id
      WHERE d.id IN (${sql.join(deckIds.map(id => sql`${id}`), sql`, `)})
    `);
    const templates = result.rows as Template[];

    return templates.map((template) => {
      const layout: LessonTemplateLayoutItem[] = template.content.layout.map((entry) => (
        { ...entry, field: template.content.fields.find((x) => (x.id === entry.field)) }
      ));
      return { ...template, layout };
    }) as LessonTemplate[];
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export type GetLessonDataParams = {
  filters: LessonFilters;
  amounts: LessonAmounts;
};

export type LessonData = NonNullable<Awaited<ReturnType<typeof getLessonData>>>;

/**
 * Retrieves all data needed for a lesson (cards, decks, templates, algorithms)
 * @param db - The database instance
 * @param dueAt - The timestamp to check card due status against
 * @param filters - Filters to apply to the query
 * @param amounts - The number of cards to retrieve for each lesson type
 * @returns Object containing lesson cards, decks, templates, and algorithms, or null if any are missing
 */
export async function getLessonData(
  db: DB,
  dueAt: Date,
  filters: LessonFilters,
  amounts: LessonAmounts,
) {
  const lessonCards = await getLessonCards(db, dueAt, filters, amounts);
  if (!lessonCards) return null;

  const deckIdsSet = new Set<number>();
  for (const { deckId } of lessonCards) deckIdsSet.add(deckId);
  const deckIds = Array.from(deckIdsSet);

  const lessonDecks = await getDecks(db, inArray(decks.id, deckIds));
  const lessonTemplates = await getLessonTemplates(db, deckIds);
  const lessonAlgorithms = await getLessonAlgorithms(db, deckIds);
  return lessonDecks && lessonTemplates && lessonAlgorithms
    ? { cards: lessonCards, decks: lessonDecks, templates: lessonTemplates, algorithms: lessonAlgorithms }
    : null;
}

export type LessonResultData = {
  card: Card;
  review: InsertReviewData;
};

/**
 * Submits a lesson result for a single card by updating card data and adding a review
 * @param db - The database instance
 * @param card - The card with updated data
 * @param review - The review data to insert
 * @returns The inserted review object
 */
export async function submitLessonResult(db: DB, { card, review }: LessonResultData) {
  try {
    const { id, ...data } = card;
    return db.transaction(async (tx) => {
      await tx
        .update(cards)
        .set(data)
        .where(eq(cards.id, id));

      const result = await tx.insert(reviews).values(review).returning();
      return result[0] as Review;
    });
  } catch (e) {
    handleDBError(e);
    return;
  }
}
