import { DEFAULT_LEARNING_SETTINGS } from "@koloda/app";
import type { LearningSettings } from "@koloda/app";
import { DEFAULT_FSRS_ALGORITHM, DEFAULT_TEMPLATE, reviewRowSchema } from "@koloda/srs";
import type { InsertAlgorithmData, InsertDeckData, InsertTemplateData, Review, Template } from "@koloda/srs";
import { addAlgorithm } from "../lib/algorithms";
import type { DB } from "../lib/db";
import { openDb } from "../lib/db";
import { addDeck } from "../lib/decks";
import { applyPendingMigrations } from "../lib/migrate";
import { parseRow } from "../lib/parse-rows";
import { REVIEW_SELECT } from "../lib/columns";
import { setSettings } from "../lib/settings";
import { addTemplate } from "../lib/templates";

let testDbSeq = 0;

export type TestDb = {
  db: DB;
  close: () => Promise<void>;
};

function toDailyLimitOverride(value: LearningSettings["dailyLimits"]["untouched"] | undefined) {
  if (typeof value === "number") return { value };
  return value ?? {};
}

function cloneTemplateData(template: InsertTemplateData): InsertTemplateData {
  return {
    title: template.title,
    content: {
      fields: template.content.fields.map((field) => ({ ...field })),
      layout: template.content.layout.map((item) => ({ ...item })),
    },
  };
}

async function deleteIdb(name: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

export async function createTestDb(): Promise<TestDb> {
  const idbName = `koloda-test-${++testDbSeq}-${Date.now()}`;
  const db = await openDb({ idbName });
  await applyPendingMigrations(db);

  return {
    db,
    close: async () => {
      await db.close();
      await deleteIdb(idbName);
    },
  };
}

export async function seedAlgorithm(db: DB, overrides: Partial<InsertAlgorithmData> = {}) {
  return addAlgorithm(db, {
    title: overrides.title ?? "Algorithm",
    content: overrides.content ?? DEFAULT_FSRS_ALGORITHM,
  });
}

export async function seedTemplate(db: DB, overrides: Partial<InsertTemplateData> = {}) {
  const template = cloneTemplateData(DEFAULT_TEMPLATE);

  return addTemplate(db, {
    ...template,
    ...overrides,
    content: overrides.content
      ? {
          fields: overrides.content.fields.map((field) => ({ ...field })),
          layout: overrides.content.layout.map((item) => ({ ...item })),
        }
      : template.content,
  });
}

export async function seedDeck(db: DB, overrides: Partial<InsertDeckData> = {}) {
  const algorithmId = overrides.algorithmId ?? (await seedAlgorithm(db)).id;
  const templateId = overrides.templateId ?? (await seedTemplate(db)).id;

  return addDeck(db, {
    title: overrides.title ?? "Deck",
    algorithmId,
    templateId,
  });
}

export async function seedDeckContext(
  db: DB,
  overrides: {
    algorithm?: Partial<InsertAlgorithmData>;
    template?: Partial<InsertTemplateData>;
    deck?: Partial<InsertDeckData>;
  } = {},
) {
  const algorithm = await seedAlgorithm(db, overrides.algorithm);
  const template = await seedTemplate(db, overrides.template);
  const deck = await seedDeck(db, {
    ...overrides.deck,
    algorithmId: overrides.deck?.algorithmId ?? algorithm.id,
    templateId: overrides.deck?.templateId ?? template.id,
  });

  return { algorithm, template, deck };
}

export function createCardContent(template: Pick<Template, "content">, overrides: Record<string, string> = {}) {
  return Object.fromEntries(
    template.content.fields.map((field) => [
      field.id.toString(),
      { text: overrides[field.id.toString()] ?? `${field.title} value` },
    ]),
  );
}

export async function seedLearningSettings(
  db: DB,
  defaults: LearningSettings["defaults"],
  overrides: Partial<LearningSettings> = {},
) {
  const content = {
    ...DEFAULT_LEARNING_SETTINGS,
    ...overrides,
    defaults,
    dailyLimits: {
      ...DEFAULT_LEARNING_SETTINGS.dailyLimits,
      ...overrides.dailyLimits,
      untouched: {
        ...DEFAULT_LEARNING_SETTINGS.dailyLimits.untouched,
        ...toDailyLimitOverride(overrides.dailyLimits?.untouched),
      },
      learn: {
        ...DEFAULT_LEARNING_SETTINGS.dailyLimits.learn,
        ...toDailyLimitOverride(overrides.dailyLimits?.learn),
      },
      review: {
        ...DEFAULT_LEARNING_SETTINGS.dailyLimits.review,
        ...toDailyLimitOverride(overrides.dailyLimits?.review),
      },
    },
  } satisfies LearningSettings;

  return setSettings(db, { name: "learning", content });
}

export async function insertReview(db: DB, review: Omit<Review, "id">) {
  const inserted = await db.run(
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
      review.createdAt,
    ],
  );
  const result = await db.get(`SELECT ${REVIEW_SELECT} FROM reviews WHERE id = ? LIMIT 1`, [inserted.lastInsertRowid]);
  return parseRow(reviewRowSchema, result, { bigintId: true });
}

export function isForeignKeyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /FOREIGN KEY constraint failed/i.test(message);
}
