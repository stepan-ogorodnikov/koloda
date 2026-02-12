import type { AllowedSettings, PatchSettingsData, SetSettingsData, SettingsName } from "@koloda/srs";
import { allowedSettings, AppError, deepMerge, throwKnownError } from "@koloda/srs";
import { eq, sql } from "drizzle-orm";
import type { DB } from "./db";
import { withUpdatedAt } from "./db";
import { settings } from "./schema";

/**
 * Retrieves settings by name from the database
 * @param db - The database instance
 * @param name - The name of the settings to retrieve
 * @returns The settings object if found, undefined otherwise
 */
export async function getSettings<T extends SettingsName>(
  db: DB,
  name: SettingsName,
): Promise<AllowedSettings<T> | undefined> {
  return throwKnownError("db.get", async () => {
    const result = await db
      .select()
      .from(settings)
      .where(eq(settings.name, name))
      .limit(1);
    // validate to inject default values if value is missing
    // e.g. after introducing a new setting default value is returned until explicitly set
    const { data, success } = allowedSettings[name].safeParse(result[0].content);

    return (success ? { ...result[0], content: data } : null) as unknown as AllowedSettings<T> || null;
  });
}

/**
 * Sets settings in the database, updating if already exist
 * @param db - The database instance
 * @param name - The name of the settings
 * @param content - The settings content to store
 * @returns The stored settings object
 */
export async function setSettings<T extends SettingsName>(db: DB, { name, content }: SetSettingsData<T>) {
  return throwKnownError("db.update", async () => {
    allowedSettings[name].parse(content);

    const result = await db
      .insert(settings)
      .values({ name, content })
      .onConflictDoUpdate({ target: settings.name, set: withUpdatedAt({ name, content }) })
      .returning();

    return result[0] as AllowedSettings<T>;
  });
}

/**
 * Patches existing settings by merging new content with existing content
 * @param db - The database instance
 * @param name - The name of the settings to patch
 * @param content - The partial settings content to merge
 * @returns The updated settings object
 */
export async function patchSettings<T extends SettingsName>(db: DB, { name, content }: PatchSettingsData<T>) {
  return throwKnownError("db.update", async () => {
    const original = await db
      .select()
      .from(settings)
      .where(eq(settings.name, name))
      .limit(1);

    const base = original[0].content as Record<string, unknown>;
    if (!base) throw new AppError("db.update");
    const merged = deepMerge(base, content);
    allowedSettings[name].parse(merged);

    const result = await db
      .update(settings)
      .set({
        content: sql`COALESCE(${settings.content}, '{}')::jsonb || ${JSON.stringify(content)}::jsonb`,
      })
      .where(eq(settings.name, name))
      .returning();

    return result[0] as AllowedSettings<T>;
  });
}
