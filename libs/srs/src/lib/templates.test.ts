import { describe, expect, it } from "vitest";
import type { TemplateField } from "./templates";
import { getTemplateFieldTitleById, validateLockedTemplateFields } from "./templates";

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
});
