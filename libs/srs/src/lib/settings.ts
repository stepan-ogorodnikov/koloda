import type { DB } from "@koloda/srs";
import { handleDBError, settings, withUpdatedAt } from "@koloda/srs";
import { eq, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import type { z } from "zod/v4";
import { interfaceSettingsValidation } from "./settings-interface";
import { learningSettingsValidation } from "./settings-learning";

export const allowedSettings = {
  interface: interfaceSettingsValidation,
  learning: learningSettingsValidation,
} as const;

export type SettingsName = keyof typeof allowedSettings;
export type SettingsContent<T extends SettingsName> = z.input<typeof allowedSettings[T]>;

export const selectSettingsSchema = createSelectSchema(settings);
export type Settings = z.input<typeof selectSettingsSchema>;
export type AllowedSettings<T extends SettingsName> = Omit<Settings, "name" | "content"> & {
  name: T;
  content: SettingsContent<T>;
};

export async function getSettings<T extends SettingsName>(
  db: DB,
  name: SettingsName,
): Promise<AllowedSettings<T> | undefined> {
  const result = await db.select().from(settings).where(eq(settings.name, name)).limit(1);
  return result[0] as AllowedSettings<T>;
}

export type SetSettingsData = {
  name: SettingsName;
  content: object;
};

export async function setSettings(db: DB, { name, content }: SetSettingsData) {
  try {
    const result = await db
      .insert(settings)
      .values({ name, content })
      .onConflictDoUpdate({ target: settings.name, set: withUpdatedAt({ name, content }) })
      .returning();

    return result[0] as Settings;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export type PatchSettingsData = SetSettingsData;

export async function patchSettings(db: DB, { name, content }: PatchSettingsData) {
  try {
    const result = await db
      .update(settings)
      .set({
        content: sql`COALESCE(${settings.content}, '{}')::jsonb || ${JSON.stringify(content)}::jsonb`,
      })
      .where(eq(settings.name, name))
      .returning();

    return result[0] as Settings;
  } catch (e) {
    handleDBError(e);
    return;
  }
}
