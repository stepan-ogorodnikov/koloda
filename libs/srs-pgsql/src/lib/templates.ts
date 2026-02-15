import type {
  CloneTemplateData,
  DeckWithOnlyTitle,
  DeleteTemplateData,
  InsertTemplateData,
  Template,
  UpdateTemplateData,
} from "@koloda/srs";
import {
  AppError,
  insertTemplateSchema,
  throwKnownError,
  updateTemplateSchema,
  validateLockedTemplateFields,
} from "@koloda/srs";
import { count, eq, getTableColumns, gt } from "drizzle-orm";
import type { DB } from "./db";
import { withUpdatedAt } from "./db";
import { cards, decks, templates } from "./schema";

/**
 * Retrieves all templates from the database
 * @param db - The database instance
 * @returns Array of Template objects
 */
export async function getTemplates(db: DB) {
  return throwKnownError("db.get", async () => {
    const result = await db
      .select()
      .from(templates)
      .orderBy(templates.createdAt);

    return result as Template[];
  });
}

/**
 * Retrieves a specific template by ID
 * @param db - The database instance
 * @param id - The ID of the template to retrieve
 * @returns The template object if found, null otherwise
 */
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

    return (result[0] as Template) || null;
  });
}

/**
 * Adds a new template to the database
 * @param db - The database instance
 * @param data - The template data to insert
 * @returns The created Template object
 */
export async function addTemplate(db: DB, data: InsertTemplateData) {
  return throwKnownError("db.add", async () => {
    const result = await db
      .insert(templates)
      .values(data)
      .returning();

    return result[0] as Template;
  });
}

/**
 * Updates an existing template in the database
 * @param db - The database instance
 * @param id - The ID of the template to update
 * @param values - The updated template values
 * @returns The updated template object
 */
export async function updateTemplate(db: DB, { id, values }: UpdateTemplateData) {
  return throwKnownError("db.update", async () => {
    const payload = updateTemplateSchema.parse(values);

    const template = await getTemplate(db, id);

    if (template?.isLocked) {
      const { isValid, errors } = validateLockedTemplateFields(template.content.fields, values.content.fields);
      if (!isValid) throw new AppError("validation.templates.update-locked", errors.join(", "));
    }

    const result = await db
      .update(templates)
      .set(withUpdatedAt(payload))
      .where(eq(templates.id, id))
      .returning();

    const returning = getTemplate(db, id);

    return returning || (result[0] as Template);
  });
}

/**
 * Clones an existing template with a new title
 * @param db - The database instance
 * @param title - The new title for the cloned template
 * @param sourceId - The ID of the source template to clone
 * @returns The created template object
 */
export async function cloneTemplate(db: DB, { title, sourceId }: CloneTemplateData) {
  return throwKnownError("db.clone", async () => {
    const sourceTemplate = await getTemplate(db, sourceId);
    if (!sourceTemplate) throw new AppError("not-found.templates.clone.source");
    const data = insertTemplateSchema.parse({ ...sourceTemplate, title });
    const result = await addTemplate(db, data);

    return result as Template;
  });
}

/**
 * Deletes a template from the database
 * @param db - The database instance
 * @param id - The ID of the template to delete
 * @returns The result of the database delete operation
 */
export async function deleteTemplate(db: DB, { id }: DeleteTemplateData) {
  return throwKnownError("db.delete", async () => {
    const template = await getTemplate(db, id);

    if (template?.isLocked) throw new AppError("validation.templates.delete-locked");

    const result = await db
      .delete(templates)
      .where(eq(templates.id, id));

    return result;
  });
}

/**
 * Retrieves all decks associated with a specific template
 * @param db - The database instance
 * @param id - The ID of the template
 * @returns Array of decks with only ID and title
 */
export async function getTemplateDecks(db: DB, { id }: DeleteTemplateData) {
  return throwKnownError("db.get", async () => {
    const result = await db
      .select({ id: decks.id, title: decks.title })
      .from(decks)
      .where(eq(decks.templateId, id));

    return result as DeckWithOnlyTitle[];
  });
}
