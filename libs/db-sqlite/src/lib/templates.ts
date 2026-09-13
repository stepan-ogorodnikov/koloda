import { AppError, mintedUuidv7, throwKnownError } from "@koloda/app";
import type {
  CloneTemplateData,
  DeleteTemplateData,
  InsertTemplateData,
  Template,
  UpdateTemplateData,
} from "@koloda/srs";
import {
  deckWithOnlyTitleSchema,
  insertTemplateSchema,
  templateRowSchema,
  updateTemplateSchema,
  validateLockedTemplateFields,
} from "@koloda/srs";
import { TEMPLATE_LOCKED_SELECT, TEMPLATE_SELECT } from "./columns";
import type { DB } from "./db";
import { parseRowOrNull, parseRows } from "./parse-rows";
import { getSettings } from "./settings";
import { nowMs, placeholders } from "./sql";

export async function getTemplates(db: DB) {
  return throwKnownError("db.get", async () => {
    const result = await db.all(`SELECT ${TEMPLATE_SELECT} FROM templates t ORDER BY t.created_at`);
    return parseRows(templateRowSchema, result);
  });
}

export async function getTemplate(db: DB, id: Template["id"]) {
  return throwKnownError("db.get", async () => {
    const result = await db.get(
      `SELECT ${TEMPLATE_SELECT}, ${TEMPLATE_LOCKED_SELECT}
       FROM templates t
       WHERE t.id = ?
       LIMIT 1`,
      [id],
    );
    return parseRowOrNull(templateRowSchema, result);
  });
}

export async function getTemplatesByIds(db: DB, ids: Template["id"][]): Promise<Map<Template["id"], Template>> {
  if (ids.length === 0) return new Map();

  const result = await throwKnownError("db.get", async () => {
    return db.all(
      `SELECT ${TEMPLATE_SELECT}, ${TEMPLATE_LOCKED_SELECT}
       FROM templates t
       WHERE t.id IN (${placeholders(ids.length)})`,
      ids,
    );
  });

  const parsed = parseRows(templateRowSchema, result);
  return new Map(parsed.map((template) => [template.id, template]));
}

export async function addTemplate(db: DB, data: InsertTemplateData, id?: string) {
  return throwKnownError("db.add", async () => {
    const payload = insertTemplateSchema.parse(data);

    const rowId = mintedUuidv7(id);
    await db.run(`INSERT INTO templates (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, NULL)`, [
      rowId,
      payload.title,
      JSON.stringify(payload.content),
      nowMs(),
    ]);
    const result = await getTemplate(db, rowId);
    if (!result) throw new Error("no row returned");
    return result;
  });
}

export async function updateTemplate(db: DB, { id, values }: UpdateTemplateData) {
  return throwKnownError("db.update", async () => {
    const payload = updateTemplateSchema.parse(values);

    const template = await getTemplate(db, id);
    if (!template) throw new AppError("not-found.templates.update.template", `Template id: ${id}`);

    if (template.isLocked) {
      const { isValid, errors } = validateLockedTemplateFields(template.content.fields, values.content.fields);
      if (!isValid) throw new AppError("validation.templates.update-locked", errors.join(", "));
    }

    await db.run(`UPDATE templates SET title = ?, content = ?, updated_at = ? WHERE id = ?`, [
      payload.title,
      JSON.stringify(payload.content),
      nowMs(),
      id,
    ]);

    const returning = await getTemplate(db, id);
    if (!returning) throw new AppError("not-found.templates.update.template", `Template id: ${id}`);
    return returning;
  });
}

export async function cloneTemplate(db: DB, { title, sourceId }: CloneTemplateData) {
  return throwKnownError("db.clone", async () => {
    const sourceTemplate = await getTemplate(db, sourceId);
    if (!sourceTemplate) throw new AppError("not-found.templates.clone.source");
    const data = insertTemplateSchema.parse({ ...sourceTemplate, title });
    return addTemplate(db, data);
  });
}

export async function deleteTemplate(db: DB, { id }: DeleteTemplateData) {
  return throwKnownError("db.delete", async () => {
    // INVARIANT: the learning default template is not deletable while it remains the default
    // (LEARNING-SETTINGS.md §Defaults, TEMPLATES.md §Deleting Templates). UI disable is a
    // convenience, not the enforcement.
    const learning = await getSettings(db, "learning");
    if (learning?.content.defaults.template === id) throw new AppError("validation.templates.delete-default");

    const template = await getTemplate(db, id);

    if (template?.isLocked) throw new AppError("validation.templates.delete-locked");

    await db.run(`DELETE FROM templates WHERE id = ?`, [id]);
  });
}

export async function getTemplateDecks(db: DB, { id }: DeleteTemplateData) {
  return throwKnownError("db.get", async () => {
    const result = await db.all(`SELECT id, title FROM decks WHERE template_id = ?`, [id]);
    return parseRows(deckWithOnlyTitleSchema, result);
  });
}
