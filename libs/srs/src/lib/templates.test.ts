import { describe, expect, it } from "vitest";
import type { TemplateField } from "./templates";
import { getTemplateFieldTitleById, validateLockedTemplateFields } from "./templates";

const ORIGINAL_FIELDS: TemplateField[] = [
  { id: 1, title: "Front", type: "text", isRequired: true },
  { id: 2, title: "Back", type: "markdown", isRequired: false },
];

describe("templates", () => {
  it("returns the matching field title by id", () => {
    expect(getTemplateFieldTitleById(ORIGINAL_FIELDS, 2)).toBe("Back");
    expect(getTemplateFieldTitleById(ORIGINAL_FIELDS, 999)).toBeUndefined();
  });

  it("allows locked template updates when only titles change", () => {
    const result = validateLockedTemplateFields(ORIGINAL_FIELDS, [
      { id: 1, title: "Prompt", type: "text", isRequired: true },
      { id: 2, title: "Response", type: "markdown", isRequired: false },
    ]);

    expect(result).toEqual({
      isValid: true,
      errors: [],
    });
  });

  it("reports missing locked fields and protected property changes", () => {
    const result = validateLockedTemplateFields(ORIGINAL_FIELDS, [
      { id: 1, title: "Front", type: "markdown", isRequired: true },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      "Missing fields: 2",
      "Field (id: 1): property 'type' changed",
    ]);
  });
});
