import type { DB, DeepPartial } from "@koloda/srs";
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
export type AllowedSettings<T extends SettingsName> = Omit<Settings, "name" | "content"> & {
  name: T;
  content: SettingsContent<T>;
};

export const selectSettingsSchema = createSelectSchema(settings);
export type Settings = z.input<typeof selectSettingsSchema>;

export async function getSettings<T extends SettingsName>(
  db: DB,
  name: SettingsName,
): Promise<AllowedSettings<T> | undefined> {
  const result = await db.select().from(settings).where(eq(settings.name, name)).limit(1);
  return result[0] as AllowedSettings<T>;
}

export type SetSettingsData<T extends SettingsName> = {
  name: SettingsName;
  content: SettingsContent<T>;
};

export async function setSettings<T extends SettingsName>(db: DB, { name, content }: SetSettingsData<T>) {
  try {
    const result = await db
      .insert(settings)
      .values({ name, content })
      .onConflictDoUpdate({ target: settings.name, set: withUpdatedAt({ name, content }) })
      .returning();

    return result[0] as AllowedSettings<T>;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export type PatchSettingsData<T extends SettingsName> = {
  name: SettingsName;
  content: DeepPartial<SettingsContent<T>>;
};

export async function patchSettings<T extends SettingsName>(db: DB, { name, content }: PatchSettingsData<T>) {
  try {
    const result = await db
      .update(settings)
      .set({
        content: sql`COALESCE(${settings.content}, '{}')::jsonb || ${JSON.stringify(content)}::jsonb`,
      })
      .where(eq(settings.name, name))
      .returning();

    return result[0] as AllowedSettings<T>;
  } catch (e) {
    handleDBError(e);
    return;
  }
}
