import type { UpdateData } from "@koloda/app";
import { SEED_TEMPLATE_TYPE_BACK_FIELD_ID, SEED_TEMPLATE_TYPE_FRONT_FIELD_ID, timestampsValidation } from "@koloda/app";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod";
import { optionalEntityNotesSchema, requiredEntityTitleSchema } from "@koloda/app";

export const TEMPLATE_FIELD_TYPES = ["text", "markdown"] as const;
export const TEMPLATE_OPERATIONS = ["display", "reveal", "type"] as const;

export type TemplateFieldType = (typeof TEMPLATE_FIELD_TYPES)[number];
export type TemplateOperation = (typeof TEMPLATE_OPERATIONS)[number];

export const TEMPLATE_FIELD_TYPES_MESSAGES = [
  { id: "text", value: msg`templates.field-types.text` },
  { id: "markdown", value: msg`templates.field-types.markdown` },
];

export const TEMPLATE_OPERATIONS_MESSAGES = [
  { id: "display", value: msg`templates.operations.display` },
  { id: "reveal", value: msg`templates.operations.reveal` },
  { id: "type", value: msg`templates.operations.type` },
];

const templateContentFields = z.object({
  fields: z
    .array(
      z.object({
        id: z.uuid({ message: "validation.templates.fields.id" }),
        title: z.string(),
        type: z.enum(TEMPLATE_FIELD_TYPES, { message: "validation.templates.fields.type" }),
        isRequired: z.boolean(),
      }),
    )
    .min(1, "validation.templates.fields.too-few"),
  layout: z
    .array(
      z.object({
        field: z.uuid({ message: "validation.templates.layout.field" }),
        operation: z.enum(TEMPLATE_OPERATIONS, { message: "validation.templates.layout.operation" }),
      }),
    )
    .min(1, "validation.templates.layout.too-few"),
});

// WHY: mirrors the Rust twin `validate_template_content` duplicate and layout membership checks, in its order
// (`docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`);
// TS must reject what Rust rejects, so keep this refine while the Rust checks exist.
const templateContent = templateContentFields.superRefine((content, ctx) => {
  const fieldIds = new Set<string>();
  for (const [index, field] of content.fields.entries()) {
    if (fieldIds.has(field.id)) {
      ctx.addIssue({
        code: "custom",
        message: "validation.templates.fields.duplicate-id",
        path: ["fields", index, "id"],
      });
    }
    fieldIds.add(field.id);
  }

  // INVARIANT: one layout item per field (TEMPLATES.md §Relationships); the editor keys layout rows by field.
  const layoutFieldIds = new Set<string>();
  for (const [index, item] of content.layout.entries()) {
    if (!fieldIds.has(item.field)) {
      ctx.addIssue({
        code: "custom",
        message: "validation.templates.layout.missing-field",
        path: ["layout", index, "field"],
      });
    } else if (layoutFieldIds.has(item.field)) {
      ctx.addIssue({
        code: "custom",
        message: "validation.templates.layout.duplicate-field",
        path: ["layout", index, "field"],
      });
    }
    layoutFieldIds.add(item.field);
  }
});

export const templateValidation = z.object({
  id: z.uuid(),
  title: requiredEntityTitleSchema,
  notes: optionalEntityNotesSchema,
  content: templateContent,
});

export const templateRowSchema = templateValidation.extend(timestampsValidation.shape).extend({
  isLocked: z.boolean(),
});

/** Partial template row from lesson SQL (`id` + `content` only). */
export const lessonTemplateRowSchema = templateValidation.pick({ id: true, content: true });

export type Template = z.infer<typeof templateRowSchema>;

export type LessonTemplateRow = z.infer<typeof lessonTemplateRowSchema>;

export type TemplateFields = Template["content"]["fields"];

export type TemplateField = TemplateFields[number];

export type TemplateLayout = Template["content"]["layout"];

export type TemplateLayoutItem = TemplateLayout[number];

const DEFAULT_FRONT_FIELD: TemplateField = {
  id: SEED_TEMPLATE_TYPE_FRONT_FIELD_ID,
  title: "Front",
  type: "text",
  isRequired: true,
};

const DEFAULT_BACK_FIELD: TemplateField = {
  id: SEED_TEMPLATE_TYPE_BACK_FIELD_ID,
  title: "Back",
  type: "text",
  isRequired: true,
};

export const DEFAULT_TEMPLATE: InsertTemplateData = {
  title: "Default",
  content: {
    fields: [DEFAULT_FRONT_FIELD, DEFAULT_BACK_FIELD],
    layout: [
      { field: SEED_TEMPLATE_TYPE_FRONT_FIELD_ID, operation: "display" },
      { field: SEED_TEMPLATE_TYPE_BACK_FIELD_ID, operation: "type" },
    ],
  },
};

// INVARIANT: a new template's default fields take their titles in the interface language when it is created
// (TEMPLATES.md §Adding Templates); a later language change does not rename them.
export function translateDefaultTemplateContent(
  translate: (message: MessageDescriptor) => string,
): InsertTemplateData["content"] {
  return {
    ...DEFAULT_TEMPLATE.content,
    fields: [
      { ...DEFAULT_FRONT_FIELD, title: translate(msg`templates.default-fields.front`) },
      { ...DEFAULT_BACK_FIELD, title: translate(msg`templates.default-fields.back`) },
    ],
  };
}

export const DEFAULT_TEMPLATE_FIELD: Omit<TemplateField, "id"> = {
  title: "",
  type: "text",
  isRequired: true,
};

export function getTemplateFieldTitleById(
  fields: Template["content"]["fields"],
  id: Template["content"]["fields"][number]["id"],
) {
  return fields.find((x) => x.id === id)?.title;
}

export const insertTemplateSchema = templateValidation.omit({ id: true, notes: true });

export type InsertTemplateData = z.input<typeof insertTemplateSchema>;

export const updateTemplateSchema = templateValidation.omit({ id: true });

export type UpdateTemplateValues = z.input<typeof updateTemplateSchema>;

export type UpdateTemplateData = UpdateData<Template, "id", UpdateTemplateValues>;

export function validateLockedTemplateFields(original: TemplateField[], updated: TemplateField[]) {
  return original.every((originalField) => {
    const updatedField = updated.find((field) => field.id === originalField.id);
    return updatedField?.type === originalField.type && updatedField.isRequired === originalField.isRequired;
  });
}

export const cloneTemplateSchema = insertTemplateSchema.pick({ title: true }).extend({
  sourceId: templateValidation.shape.id,
});

export type CloneTemplateData = z.infer<typeof cloneTemplateSchema>;

export type DeleteTemplateData = Pick<Template, "id">;
