import type {
  CloneTemplateData,
  DeckWithOnlyTitle,
  DeleteTemplateData,
  InsertTemplateData,
  Template,
  TemplateField,
  UpdateTemplateData,
} from "@koloda/srs";
import { handleDBError, insertTemplateSchema, updateTemplateSchema } from "@koloda/srs";
import { count, eq, getTableColumns, gt } from "drizzle-orm";
import type { DB } from "./db";
import { withUpdatedAt } from "./db";
import { cards, decks, templates } from "./schema";

/**
 * Gets the title of a template field by its ID
 * @param fields - Array of template fields
 * @param id - The ID of the field to find
 * @returns The title of the field if found, undefined otherwise
 */
export function getTemplateFieldTitleById(
  fields: Template["content"]["fields"],
  id: Template["content"]["fields"][number]["id"],
) {
  return fields.find((x) => x.id === id)?.title;
}

/**
 * Retrieves all templates from the database
 * @param db - The database instance
 * @returns Array of Template objects
 */
export async function getTemplates(db: DB) {
  try {
    const result = await db
      .select()
      .from(templates)
      .orderBy(templates.createdAt);

    return result as Template[];
  } catch (e) {
    handleDBError(e);
    return [];
  }
}

/**
 * Retrieves a specific template by ID
 * @param db - The database instance
 * @param id - The ID of the template to retrieve
 * @returns The template object if found, null otherwise
 */
export async function getTemplate(db: DB, id: Template["id"] | string) {
  try {
    const result = await db
      .select({
        ...getTableColumns(templates),
        isLocked: gt(count(cards.id), 0),
      })
      .from(templates)
      .leftJoin(cards, eq(templates.id, cards.templateId))
      .where(eq(templates.id, Number(id)))
      .groupBy(...Object.values(getTableColumns(templates)))
      .limit(1);

    return result[0] as Template || null;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

/**
 * Adds a new template to the database
 * @param db - The database instance
 * @param data - The template data to insert
 * @returns The created Template object
 */
export async function addTemplate(db: DB, data: InsertTemplateData) {
  try {
    const result = await db.insert(templates).values(data).returning();
    return result[0] as Template;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

/**
 * Updates an existing template in the database
 * @param db - The database instance
 * @param id - The ID of the template to update
 * @param values - The updated template values
 * @returns The updated template object
 */
export async function updateTemplate(db: DB, { id, values }: UpdateTemplateData) {
  try {
    const payload = updateTemplateSchema.parse(values);

    const template = await getTemplate(db, id);

    if (template?.isLocked) {
      const { isValid, errors } = validateLockedTemplateFields(payload.content.fields, values.content.fields);
      if (!isValid) throw errors;
    }

    const result = await db
      .update(templates)
      .set(withUpdatedAt(payload))
      .where(eq(templates.id, Number(id)))
      .returning();

    const returning = getTemplate(db, id);

    return returning || result[0] as Template;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

/**
 * Validates that locked template fields have not been modified inappropriately
 * @param original - The original template fields
 * @param updated - The updated template fields
 * @returns Object containing validation result and any errors found
 */
function validateLockedTemplateFields(original: TemplateField[], updated: TemplateField[]) {
  const errors: string[] = [];

  // check if all fields are present
  const updatedIds = new Set(updated.map(field => field.id));
  const missingIds = original
    .map(field => field.id)
    .filter(id => !updatedIds.has(id));

  if (missingIds.length > 0) {
    errors.push(`Missing fields: ${missingIds.join(", ")}`);
  }

  // check if properties (except 'title') are not changed
  for (const originalField of original) {
    const updatedField = updated.find(f => f.id === originalField.id);
    if (!updatedField) continue;

    const originalKeys = Object.keys(originalField) as (keyof TemplateField)[];
    for (const key of originalKeys) {
      if (key === "title") continue;

      if (updatedField[key] !== originalField[key]) {
        errors.push(`Field (id: ${originalField.id}): property '${key}' changed`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Clones an existing template with a new title
 * @param db - The database instance
 * @param title - The new title for the cloned template
 * @param sourceId - The ID of the source template to clone
 * @returns The created template object
 */
export async function cloneTemplate(db: DB, { title, sourceId }: CloneTemplateData) {
  try {
    const sourceTemplate = await getTemplate(db, sourceId);
    if (!sourceTemplate) throw ("Source template not found");
    const data = insertTemplateSchema.parse({ ...sourceTemplate, title });
    const result = await addTemplate(db, data);
    return result as Template;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

/**
 * Deletes a template from the database
 * @param db - The database instance
 * @param id - The ID of the template to delete
 * @returns The result of the database delete operation
 */
export async function deleteTemplate(db: DB, { id }: DeleteTemplateData) {
  try {
    const template = await getTemplate(db, id);

    if (template?.isLocked) throw "Can't delete locked template";

    const result = await db.delete(templates).where(eq(templates.id, Number(id)));
    return result;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

/**
 * Retrieves all decks associated with a specific template
 * @param db - The database instance
 * @param id - The ID of the template
 * @returns Array of decks with only ID and title
 */
export async function getTemplateDecks(db: DB, { id }: DeleteTemplateData) {
  try {
    const result = await db
      .select({ id: decks.id, title: decks.title })
      .from(decks)
      .where(eq(decks.templateId, Number(id)));
    return result as DeckWithOnlyTitle[];
  } catch (e) {
    handleDBError(e);
    return [];
  }
}
