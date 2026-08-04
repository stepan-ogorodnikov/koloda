import type { InterfaceSettings } from "@koloda/app";
import { AppError, DEFAULT_INTERFACE_SETTINGS, interfaceSettingsValidation } from "@koloda/app";
import { DEFAULT_HOTKEYS_SETTINGS, hotkeysSettingsValidation } from "@koloda/app";
import { DEFAULT_LEARNING_SETTINGS, learningSettingsValidation } from "@koloda/app";
import { addAlgorithm, addTemplate, setSettings } from "@koloda/srs-pgsql";
import { sql } from "drizzle-orm";
import { db, migrations, MIGRATIONS_TABLE } from "./db";
import { loadSeedData } from "./seed/seed";

/**
 * Gets the current status of the database
 * @returns "blank" if no migrations have been applied, "ok" otherwise
 */
export async function getStatus() {
  const appliedMigrations = await getAppliedMigrations();
  if (appliedMigrations.length === 0) return "blank";
  await migrate();
  return "ok";
}

/**
 * Retrieves the list of applied database migrations
 * @returns Array of migration records
 */
async function getAppliedMigrations() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
    	id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "__migrations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
    	name varchar NOT NULL,
    	created_at timestamp DEFAULT now() NOT NULL
    );
  `);

  const result = await db.execute(sql`SELECT * FROM ${MIGRATIONS_TABLE};`);
  return result?.rows;
}

/**
 * Applies missing database migrations
 */
export async function migrate() {
  const appliedMigrations = await getAppliedMigrations();

  await db.transaction(async (tx) => {
    for (const [name, { default: migration }] of migrations) {
      if (appliedMigrations.some((x) => x.name === name)) continue;

      const statements = migration.split("--> statement-breakpoint");
      for (const statement of statements) {
        await tx.execute(statement);
      }
      await tx.execute(sql` INSERT INTO ${MIGRATIONS_TABLE} ("name") VALUES (${sql.raw(`'${name}'`)}); `);
    }
  });
}

type SetupFromScratchData = Partial<InterfaceSettings>;

/**
 * Sets up the application from scratch by applying migrations,
 * seeding locale templates/algorithms, and configuring settings
 * @param data - Configuration data including interface settings
 * @returns Promise resolving to true if setup was successful, false otherwise
 */
export async function setupFromScratch(settings: SetupFromScratchData) {
  try {
    await migrate();

    const seed = await loadSeedData(settings.language ?? "en");

    const algorithmIds = new Map<string, number>();
    for (const algorithm of seed.algorithms) {
      const returning = await addAlgorithm(db, { title: algorithm.title, content: algorithm.content });
      if (!returning?.id) throw new AppError("db.add");
      algorithmIds.set(algorithm.id, returning.id);
    }

    const templateIds = new Map<string, number>();
    for (const template of seed.templates) {
      const returning = await addTemplate(db, { title: template.title, content: template.content });
      if (!returning?.id) throw new AppError("db.add");
      templateIds.set(template.id, returning.id);
    }

    const algorithm = algorithmIds.get("simple");
    const template = templateIds.get("type");
    if (!algorithm || !template) throw new AppError("db.add");

    await setSettings(db, {
      name: "interface",
      content: interfaceSettingsValidation.parse({ ...DEFAULT_INTERFACE_SETTINGS, ...settings }),
    });
    await setSettings(db, {
      name: "learning",
      content: learningSettingsValidation.parse({ ...DEFAULT_LEARNING_SETTINGS, defaults: { algorithm, template } }),
    });
    await setSettings(db, { name: "hotkeys", content: hotkeysSettingsValidation.parse(DEFAULT_HOTKEYS_SETTINGS) });

    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}
