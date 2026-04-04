import { PGlite } from "@electric-sql/pglite";
import { DEFAULT_FSRS_ALGORITHM, DEFAULT_LEARNING_SETTINGS, DEFAULT_TEMPLATE } from "@koloda/srs";
import type {
  InsertAlgorithmData,
  InsertDeckData,
  InsertTemplateData,
  LearningSettings,
  Review,
  Template,
} from "@koloda/srs";
import { drizzle } from "drizzle-orm/pglite";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addAlgorithm } from "../lib/algorithms";
import type { DB } from "../lib/db";
import { addDeck } from "../lib/decks";
import { reviews, schema } from "../lib/schema";
import { setSettings } from "../lib/settings";
import { addTemplate } from "../lib/templates";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../../drizzle/pgsql");

let migrationStatementsPromise: Promise<string[]> | undefined;

export type TestDb = {
  client: PGlite;
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

async function getMigrationStatements() {
  if (!migrationStatementsPromise) {
    migrationStatementsPromise = readdir(migrationsDir)
      .then((files) => files.filter((file) => file.endsWith(".sql")).sort())
      .then((files) => Promise.all(files.map((file) => readFile(resolve(migrationsDir, file), "utf8"))))
      .then((migrations) =>
        migrations.flatMap((migration) => (
          migration
            .split("--> statement-breakpoint")
            .map((statement) => statement.trim())
            .filter(Boolean)
        ))
      );
  }

  return migrationStatementsPromise;
}

async function applyMigrations(client: PGlite) {
  const statements = await getMigrationStatements();

  for (const statement of statements) {
    await client.exec(statement);
  }
}

export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  await applyMigrations(client);

  return {
    client,
    db: drizzle({ client, schema }),
    close: () => client.close(),
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

export async function seedDeck(
  db: DB,
  overrides: Partial<InsertDeckData> = {},
) {
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
  const result = await db.insert(reviews).values(review).returning();
  return result[0] as Review;
}
