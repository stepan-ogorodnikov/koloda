import type { Template } from "@koloda/srs";
import { describe, expect, it } from "vitest";
import { getCardsTableContentColumns } from "./cards-table-utility";

function createTemplate(id: number, fields: Array<{ title: string }>): Template {
  return {
    id,
    title: `Template ${id}`,
    content: {
      fields: fields.map((f, i) => ({
        id: i + 1,
        title: f.title,
        type: "text" as const,
        isRequired: true,
      })),
      layout: [],
    },
    isLocked: false,
    createdAt: new Date(),
    updatedAt: null,
  };
}

describe("getCardsTableContentColumns", () => {
  it("returns an empty array for empty templates input", () => {
    expect(getCardsTableContentColumns([])).toEqual([]);
  });

  it("uses field titles directly for a single template", () => {
    const templates = [createTemplate(1, [{ title: "Front" }, { title: "Back" }])];
    const result = getCardsTableContentColumns(templates);

    expect(result).toHaveLength(2);
    expect(result[0].header).toBe("Front");
    expect(result[1].header).toBe("Back");
  });

  it("deduplicates when all templates share the same field title at each position", () => {
    const templates = [
      createTemplate(1, [{ title: "Front" }, { title: "Back" }]),
      createTemplate(2, [{ title: "Front" }, { title: "Back" }]),
    ];
    const result = getCardsTableContentColumns(templates);

    expect(result).toHaveLength(2);
    expect(result[0].header).toBe("Front");
    expect(result[1].header).toBe("Back");
  });

  it("falls back to #N when templates have different titles at the same position", () => {
    const templates = [
      createTemplate(1, [{ title: "Front" }, { title: "Back" }]),
      createTemplate(2, [{ title: "Question" }, { title: "Answer" }]),
    ];
    const result = getCardsTableContentColumns(templates);

    expect(result).toHaveLength(2);
    expect(result[0].header).toBe("#1");
    expect(result[1].header).toBe("#2");
  });

  it("uses the longest template's field count as column count", () => {
    const templates = [
      createTemplate(1, [{ title: "Front" }]),
      createTemplate(2, [{ title: "A" }, { title: "B" }, { title: "C" }]),
    ];
    const result = getCardsTableContentColumns(templates);

    expect(result).toHaveLength(3);
  });

  it("getFieldId returns correct field id for each template", () => {
    const templates = [createTemplate(1, [{ title: "Front" }]), createTemplate(2, [{ title: "Prompt" }])];
    const result = getCardsTableContentColumns(templates);

    expect(result[0].getFieldId(templates[0])).toBe(1);
    expect(result[0].getFieldId(templates[1])).toBe(1);
  });

  it("getFieldId returns undefined when template is undefined", () => {
    const templates = [createTemplate(1, [{ title: "Front" }])];
    const cols = getCardsTableContentColumns(templates);

    expect(cols[0].getFieldId(undefined)).toBeUndefined();
  });

  it("getFieldId returns undefined for index beyond template fields", () => {
    const mixed = [createTemplate(1, [{ title: "A" }]), createTemplate(2, [{ title: "X" }, { title: "Y" }])];
    const cols = getCardsTableContentColumns(mixed);
    expect(cols).toHaveLength(2);
    expect(cols[1].getFieldId(mixed[0])).toBeUndefined(); // template 1 has no second field
    expect(cols[1].getFieldId(mixed[1])).toBe(2);
  });

  it("includes index starting from 0 for each column", () => {
    const templates = [createTemplate(1, [{ title: "A" }, { title: "B" }, { title: "C" }])];
    const result = getCardsTableContentColumns(templates);

    expect(result[0].index).toBe(0);
    expect(result[1].index).toBe(1);
    expect(result[2].index).toBe(2);
  });
});
