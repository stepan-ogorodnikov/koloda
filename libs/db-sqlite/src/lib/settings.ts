import { AppError, throwKnownError } from "@koloda/app";
import { deepMerge } from "@koloda/app";
import { allowedSettings, settingsRowEnvelopeSchema, settingsRowSchema } from "@koloda/settings";
import type { AllowedSettings, PatchSettingsData, SetSettingsData, SettingsName } from "@koloda/settings";
import { z } from "zod";
import { SETTINGS_SELECT } from "./columns";
import type { DB } from "./db";
import { parseRow } from "./parse-rows";
import { nowMs } from "./sql";

export async function getSettings<T extends SettingsName>(db: DB, name: T) {
  return throwKnownError("db.get", async () => {
    const result = await db.get(`SELECT ${SETTINGS_SELECT} FROM settings WHERE name = ? LIMIT 1`, [name]);
    if (!result) return null;

    const envelope = parseRow(settingsRowEnvelopeSchema, result);

    const { data, success } = allowedSettings[name].safeParse(envelope.content);
    if (!success) return null;

    return parseRow(settingsRowSchema(name), { ...envelope, content: data }) as AllowedSettings<T>;
  });
}

export async function setSettings<T extends SettingsName>(db: DB, { name, content }: SetSettingsData<T>) {
  return throwKnownError("db.update", async () => {
    const parsed = allowedSettings[name].parse(content);
    const now = nowMs();

    await db.run(
      `INSERT INTO settings (name, content, created_at, updated_at)
       VALUES (?, ?, ?, NULL)
       ON CONFLICT(name) DO UPDATE SET
         content = excluded.content,
         updated_at = ?`,
      [name, JSON.stringify(parsed), now, now],
    );

    const result = await db.get(`SELECT ${SETTINGS_SELECT} FROM settings WHERE name = ? LIMIT 1`, [name]);
    return parseRow(settingsRowSchema(name), result) as AllowedSettings<T>;
  });
}

export async function patchSettings<T extends SettingsName>(db: DB, { name, content }: PatchSettingsData<T>) {
  return throwKnownError("db.update", async () => {
    const original = await db.get(`SELECT ${SETTINGS_SELECT} FROM settings WHERE name = ? LIMIT 1`, [name]);
    if (!original) throw new AppError("db.update");

    const envelope = parseRow(settingsRowEnvelopeSchema, original);
    const base = z.record(z.string(), z.unknown()).parse(envelope.content);
    const merged = deepMerge(base, content);
    const parsed = allowedSettings[name].parse(merged);
    const now = nowMs();

    await db.run(`UPDATE settings SET content = ?, updated_at = ? WHERE name = ?`, [JSON.stringify(parsed), now, name]);

    const result = await db.get(`SELECT ${SETTINGS_SELECT} FROM settings WHERE name = ? LIMIT 1`, [name]);
    return parseRow(settingsRowSchema(name), result) as AllowedSettings<T>;
  });
}
