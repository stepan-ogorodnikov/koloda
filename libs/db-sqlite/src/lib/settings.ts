import { AppError, throwKnownError } from "@koloda/app";
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

    const parsed = allowedSettings[name].safeParse(envelope.content);
    // INVARIANT: a present-but-invalid row must fail closed — desktop `get_settings`
    // normalizes the content and errors. Returning null would read as "absent" and
    // bypass the delete-default guards (twin of Rust `learning_defaults`).
    if (!parsed.success) throw new AppError("db.get", `Invalid ${name} settings: ${parsed.error.message}`);

    return parseRow(settingsRowSchema(name), { ...envelope, content: parsed.data }) as AllowedSettings<T>;
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
    // INVARIANT: patches merge per RFC 7386, matching desktop `json_patch::merge`
    // (crates/koloda/src/repo/settings.rs): `null` deletes a key so the schema
    // default refills it, arrays replace wholesale. Do not swap in deepMerge —
    // it assigns null and element-merges arrays, which diverges from desktop.
    const merged = mergePatch(base, content);
    const parsed = allowedSettings[name].parse(merged);
    const now = nowMs();

    await db.run(`UPDATE settings SET content = ?, updated_at = ? WHERE name = ?`, [JSON.stringify(parsed), now, name]);

    const result = await db.get(`SELECT ${SETTINGS_SELECT} FROM settings WHERE name = ? LIMIT 1`, [name]);
    return parseRow(settingsRowSchema(name), result) as AllowedSettings<T>;
  });
}

function isMergeableObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Set) &&
    !(value instanceof Map)
  );
}

// RFC 7386 JSON Merge Patch, the web twin of desktop `json_patch::merge`.
function mergePatch(target: unknown, patch: unknown): unknown {
  if (!isMergeableObject(patch)) return patch;
  const output: Record<string, unknown> = isMergeableObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete output[key];
    else output[key] = mergePatch(output[key], value);
  }
  return output;
}
