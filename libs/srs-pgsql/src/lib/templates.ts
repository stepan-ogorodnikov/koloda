import { AppError, throwKnownError } from "@koloda/app";
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
import { count, eq, getTableColumns, gt, inArray } from "drizzle-orm";
import type { DB } from "./db";
import { withUpdatedAt } from "./db";
import { assertRow, assertRowOrNull, assertRows } from "./parse-rows";
import { cards, decks, templates } from "./schema";

export async function getTemplates(db: DB) {
  return throwKnownError("db.get", async () => {
    const result = await db.select().from(templates).orderBy(templates.createdAt);

    return assertRows(templateRowSchema, result);
  });
}

export async function getTemplate(db: DB, id: Template["id"]) {
  return throwKnownError("db.get", async () => {
    const result = await db
      .select({
        ...getTableColumns(templates),
        isLocked: gt(count(cards.id), 0),
      })
      .from(templates)
      .leftJoin(cards, eq(templates.id, cards.templateId))
      .where(eq(templates.id, id))
      .groupBy(...Object.values(getTableColumns(templates)))
      .limit(1);

    return assertRowOrNull(templateRowSchema, result[0]);
  });
}

export async function getTemplatesByIds(db: DB, ids: Template["id"][]): Promise<Map<Template["id"], Template>> {
  if (ids.length === 0) return new Map();

  const result = await throwKnownError("db.get", async () => {
    return db
      .select({
        ...getTableColumns(templates),
        isLocked: gt(count(cards.id), 0),
      })
      .from(templates)
      .leftJoin(cards, eq(templates.id, cards.templateId))
      .where(inArray(templates.id, ids))
      .groupBy(...Object.values(getTableColumns(templates)));
  });

  const parsed = assertRows(templateRowSchema, result);
  return new Map(parsed.map((t) => [t.id, t]));
}

export async function addTemplate(db: DB, data: InsertTemplateData) {
  return throwKnownError("db.add", async () => {
    const result = await db.insert(templates).values(data).returning();

    return assertRow(templateRowSchema, result[0]);
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

    await db.update(templates).set(withUpdatedAt(payload)).where(eq(templates.id, id));

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
    const template = await getTemplate(db, id);

    if (template?.isLocked) throw new AppError("validation.templates.delete-locked");

    const result = await db.delete(templates).where(eq(templates.id, id));

    return result;
  });
}

export async function getTemplateDecks(db: DB, { id }: DeleteTemplateData) {
  return throwKnownError("db.get", async () => {
    const result = await db.select({ id: decks.id, title: decks.title }).from(decks).where(eq(decks.templateId, id));

    return assertRows(deckWithOnlyTitleSchema, result);
  });
}
