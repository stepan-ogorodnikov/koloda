import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { count, eq, getTableColumns, gt } from "drizzle-orm";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod/v4";
import type { DB } from "./db";
import { handleDBError, TIMESTAMPS, withUpdatedAt } from "./db";
import type { DeckWithOnlyTitle } from "./decks";
import { cards, decks, templates } from "./schema";
import type { UpdateData } from "./utility";

export const templatesMessages: Record<string, MessageDescriptor> = {
  "title.min-length": msg`title.min-length`,
  "title.max-length": msg`title.max-length`,
  "fields.min-length": msg`fields.min-length`,
  "layout.min-length": msg`layout.min-length`,
};

export const TEMPLATE_FIELD_TYPES = ["text"] as const;
export const TEMPLATE_OPERATIONS = ["display", "reveal", "type"] as const;

export type TemplateOperation = typeof TEMPLATE_OPERATIONS[number];

export const templatesValidation = {
  title: z
    .string()
    .min(1, "title.min-length")
    .max(255, "title.max-length"),
  content: z.object({
    fields: z.array(z.object({
      id: z.number(),
      title: z.string(),
      type: z.enum(TEMPLATE_FIELD_TYPES),
      isRequired: z.boolean(),
    })).min(1, "fields.min-length"),
    layout: z.array(z.object({
      field: z.number(),
      operation: z.enum(TEMPLATE_OPERATIONS),
    })).min(1, "layout.min-length"),
  }),
};

export const selectTemplateSchema = createSelectSchema(templates);
export type Template = z.infer<typeof selectTemplateSchema> & { isLocked: boolean };
export type TemplateFields = Template["content"]["fields"];
export type TemplateField = TemplateFields[number];
export type TemplateLayout = Template["content"]["layout"];
export type TemplateLayoutItem = TemplateLayout[number];

export const DEFAULT_TEMPLATE: InsertTemplateData = {
  title: "Default",
  content: {
    fields: [
      { id: 1, title: "Front", type: "text", isRequired: true },
      { id: 2, title: "Back", type: "text", isRequired: true },
    ],
    layout: [
      { field: 1, operation: "display" },
      { field: 2, operation: "type" },
    ],
  },
};

export const DEFAULT_TEMPLATE_FIELD: TemplateField = {
  id: 0,
  title: "",
  type: "text",
  isRequired: true,
};

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
      .from(templates);

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

export const insertTemplateSchema = createInsertSchema(templates, templatesValidation).omit(TIMESTAMPS);
export type InsertTemplateData = z.input<typeof insertTemplateSchema>;

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

export const updateTemplateSchema = createUpdateSchema(templates, templatesValidation).omit(TIMESTAMPS);
export type UpdateTemplateValues = z.input<typeof updateTemplateSchema>;
export type UpdateTemplateData = UpdateData<Template, "id", UpdateTemplateValues>;

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

    return result[0] as Template;
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

export const cloneTemplateSchema = insertTemplateSchema.pick({ title: true }).extend({ sourceId: z.string() });
export type CloneTemplateData = z.infer<typeof cloneTemplateSchema>;

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

export type DeleteTemplateData = Pick<Template, "id">;

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
