import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod/v4";
import type { Timestamps } from "./db";
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

export const templateValidation = z.object({
  id: z.int(),
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
});

export type Template = z.infer<typeof templateValidation> & Timestamps & { isLocked: boolean };

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

export const insertTemplateSchema = templateValidation.omit({ id: true });

export type InsertTemplateData = z.input<typeof insertTemplateSchema>;

export const updateTemplateSchema = templateValidation.omit({ id: true });

export type UpdateTemplateValues = z.input<typeof updateTemplateSchema>;

export type UpdateTemplateData = UpdateData<Template, "id", UpdateTemplateValues>;

/**
 * Validates that locked template fields have not been modified inappropriately
 * @param original - The original template fields
 * @param updated - The updated template fields
 * @returns Object containing validation result and any errors found
 */
export function validateLockedTemplateFields(original: TemplateField[], updated: TemplateField[]) {
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

export const cloneTemplateSchema = insertTemplateSchema.pick({ title: true }).extend({
  sourceId: templateValidation.shape.id,
});

export type CloneTemplateData = z.infer<typeof cloneTemplateSchema>;

export type DeleteTemplateData = Pick<Template, "id">;
