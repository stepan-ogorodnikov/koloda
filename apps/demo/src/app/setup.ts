import type { InterfaceSettings } from "@koloda/srs";
import {
  addAlgorithm,
  addTemplate,
  DEFAULT_INTERFACE_SETTINGS,
  DEFAULT_LEARNING_SETTINGS,
  DEFAULT_TEMPLATE,
  interfaceSettingsValidation,
  learningSettingsValidation,
  setSettings,
} from "@koloda/srs";
import { DEFAULT_FSRS_ALGORITHM } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import type { I18nContext } from "@lingui/react";
import { sql } from "drizzle-orm";
import { db, migrations, MIGRATIONS_TABLE } from "./db";

export async function getStatus() {
  const appliedMigrations = await getMigrations();
  if (appliedMigrations.length === 0) return "blank";
  return "ok";
}

async function getMigrations() {
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

export async function migrate() {
  const appliedMigrations = await getMigrations();

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

type SetupFromScratchData = Partial<InterfaceSettings> & { t: I18nContext["_"] };

export async function setupFromScratch({ t, ...settings }: SetupFromScratchData) {
  try {
    await migrate();

    const title = t(msg`demo.setup.default-title`);

    const returningAlgorithm = await addAlgorithm(db, { title, content: DEFAULT_FSRS_ALGORITHM });
    const algorithm = returningAlgorithm?.id;
    if (!algorithm) throw ("Couldn't add default algorithm");

    const returningTemplate = await addTemplate(db, { ...DEFAULT_TEMPLATE, title });
    const template = returningTemplate?.id;
    if (!template) throw ("Couldn't add default template");

    await setSettings(
      db,
      { name: "interface", content: interfaceSettingsValidation.parse({ ...DEFAULT_INTERFACE_SETTINGS, ...settings }) },
    );
    await setSettings(
      db,
      {
        name: "learning",
        content: learningSettingsValidation.parse({ ...DEFAULT_LEARNING_SETTINGS, defaults: { algorithm, template } }),
      },
    );
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}
