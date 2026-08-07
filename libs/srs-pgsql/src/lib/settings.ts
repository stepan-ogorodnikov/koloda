import { AppError, throwKnownError } from "@koloda/app";
import { deepMerge } from "@koloda/app";
import type { AllowedSettings, PatchSettingsData, SetSettingsData, SettingsName } from "@koloda/app";
import { allowedSettings, settingsRowEnvelopeSchema, settingsRowSchema } from "@koloda/app";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "./db";
import { withUpdatedAt } from "./db";
import { assertRow } from "./parse-rows";
import { settings } from "./schema";

export async function getSettings<T extends SettingsName>(db: DB, name: SettingsName) {
  return throwKnownError("db.get", async () => {
    const result = await db.select().from(settings).where(eq(settings.name, name)).limit(1);

    if (!result[0]) return null;

    const envelope = assertRow(settingsRowEnvelopeSchema, result[0]);

    const { data, success } = allowedSettings[name].safeParse(envelope.content);
    if (!success) return null;

    return assertRow(settingsRowSchema(name), { ...envelope, content: data }) as AllowedSettings<T>;
  });
}

export async function setSettings<T extends SettingsName>(db: DB, { name, content }: SetSettingsData<T>) {
  return throwKnownError("db.update", async () => {
    const parsed = allowedSettings[name].parse(content);

    const result = await db
      .insert(settings)
      .values({ name, content: parsed })
      .onConflictDoUpdate({ target: settings.name, set: withUpdatedAt({ name, content: parsed }) })
      .returning();

    return assertRow(settingsRowSchema(name), result[0]) as AllowedSettings<T>;
  });
}

export async function patchSettings<T extends SettingsName>(db: DB, { name, content }: PatchSettingsData<T>) {
  return throwKnownError("db.update", async () => {
    const original = await db.select().from(settings).where(eq(settings.name, name)).limit(1);
    if (!original[0]) throw new AppError("db.update");

    const envelope = assertRow(settingsRowEnvelopeSchema, original[0]);
    const base = z.record(z.string(), z.unknown()).parse(envelope.content);
    const merged = deepMerge(base, content);
    const parsed = allowedSettings[name].parse(merged);

    const result = await db
      .update(settings)
      .set(withUpdatedAt({ content: parsed }))
      .where(eq(settings.name, name))
      .returning();

    return assertRow(settingsRowSchema(name), result[0]) as AllowedSettings<T>;
  });
}
