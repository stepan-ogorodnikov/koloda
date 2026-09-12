import { describe, expect, it } from "vitest";
import type { TemplateField } from "./templates";
import {
  getTemplateFieldTitleById,
  insertTemplateSchema,
  updateTemplateSchema,
  validateLockedTemplateFields,
} from "./templates";

const FRONT_ID = "01900000-0000-7000-8000-000000000001";
const BACK_ID = "01900000-0000-7000-8000-000000000002";

const ORIGINAL_FIELDS: TemplateField[] = [
  { id: FRONT_ID, title: "Front", type: "text", isRequired: true },
  { id: BACK_ID, title: "Back", type: "markdown", isRequired: false },
];

describe("templates", () => {
  it("returns the matching field title by id", () => {
    expect(getTemplateFieldTitleById(ORIGINAL_FIELDS, BACK_ID)).toBe("Back");
    expect(getTemplateFieldTitleById(ORIGINAL_FIELDS, "01900000-0000-7000-8000-0000000003e7")).toBeUndefined();
  });

  it("allows locked template updates when only titles change", () => {
    const result = validateLockedTemplateFields(ORIGINAL_FIELDS, [
      { id: FRONT_ID, title: "Prompt", type: "text", isRequired: true },
      { id: BACK_ID, title: "Response", type: "markdown", isRequired: false },
    ]);

    expect(result).toEqual({
      isValid: true,
      errors: [],
    });
  });

  it("reports missing locked fields and protected property changes", () => {
    const result = validateLockedTemplateFields(ORIGINAL_FIELDS, [
      { id: FRONT_ID, title: "Front", type: "markdown", isRequired: true },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([`Missing fields: ${BACK_ID}`, `Field (id: ${FRONT_ID}): property 'type' changed`]);
  });

  it("accepts an insert template whose layout items reference existing fields", () => {
    const result = insertTemplateSchema.safeParse({
      title: "Basic",
      content: {
        fields: ORIGINAL_FIELDS,
        layout: [
          { field: FRONT_ID, operation: "display" },
          { field: BACK_ID, operation: "type" },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects an insert template whose layout item references a missing field", () => {
    const result = insertTemplateSchema.safeParse({
      title: "Basic",
      content: {
        fields: ORIGINAL_FIELDS,
        layout: [
          { field: FRONT_ID, operation: "display" },
          { field: "01900000-0000-7000-8000-0000000003e7", operation: "type" },
        ],
      },
    });

    expect(result.success).toBe(false);
    const issue = result.success
      ? undefined
      : result.error.issues.find((x) => x.message === "validation.templates.layout.missing-field");
    expect(issue?.path).toEqual(["content", "layout", 1, "field"]);
  });

  it("rejects an insert template whose content has no fields", () => {
    const result = insertTemplateSchema.safeParse({
      title: "Basic",
      content: {
        fields: [],
        layout: [{ field: FRONT_ID, operation: "display" }],
      },
    });

    expect(result.success).toBe(false);
    const issue = result.success
      ? undefined
      : result.error.issues.find((x) => x.message === "validation.templates.fields.too-few");
    expect(issue?.path).toEqual(["content", "fields"]);
  });

  it("rejects an insert template whose content has no layout items", () => {
    const result = insertTemplateSchema.safeParse({
      title: "Basic",
      content: {
        fields: ORIGINAL_FIELDS,
        layout: [],
      },
    });

    expect(result.success).toBe(false);
    const issue = result.success
      ? undefined
      : result.error.issues.find((x) => x.message === "validation.templates.layout.too-few");
    expect(issue?.path).toEqual(["content", "layout"]);
  });

  it("rejects an insert template whose field type is not supported", () => {
    const result = insertTemplateSchema.safeParse({
      title: "Basic",
      content: {
        fields: [{ ...ORIGINAL_FIELDS[0], type: "html" }, ORIGINAL_FIELDS[1]],
        layout: [
          { field: FRONT_ID, operation: "display" },
          { field: BACK_ID, operation: "type" },
        ],
      },
    });

    expect(result.success).toBe(false);
    const issue = result.success ? undefined : result.error.issues.find((x) => x.code === "invalid_value");
    expect(issue?.path).toEqual(["content", "fields", 0, "type"]);
  });

  it("rejects an update template whose layout operation is not supported", () => {
    const result = updateTemplateSchema.safeParse({
      title: "Basic",
      content: {
        fields: ORIGINAL_FIELDS,
        layout: [{ field: FRONT_ID, operation: "hide" }],
      },
    });

    expect(result.success).toBe(false);
    const issue = result.success ? undefined : result.error.issues.find((x) => x.code === "invalid_value");
    expect(issue?.path).toEqual(["content", "layout", 0, "operation"]);
  });
});
