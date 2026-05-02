import { describe, expect, it } from "vitest";
import { deepMerge, getNextNumericId, mapObjectProperties, mapObjectPropertiesReverse } from "./utility";

describe("utility", () => {
  it("gets the next numeric id for empty and sparse collections", () => {
    expect(getNextNumericId()).toBe(1);
    expect(getNextNumericId([{ id: 2 }, { id: 7 }, { id: 3 }])).toBe(8);
  });

  it("deeply merges nested objects, array items, and special objects", () => {
    const initial = {
      meta: {
        title: "Template",
        flags: { isLocked: false, isFavorite: false },
      },
      fields: [
        { id: 1, title: "Front", type: "text" },
        { id: 2, title: "Back", type: "text" },
      ],
      dueAt: new Date("2024-01-01T00:00:00.000Z"),
      untouched: 1,
    };
    const updated = deepMerge(initial, {
      meta: {
        flags: { isFavorite: true },
      },
      fields: [
        { title: "Prompt" },
      ],
      dueAt: new Date("2024-01-02T00:00:00.000Z"),
      untouched: undefined,
    });

    expect(updated).toEqual({
      meta: {
        title: "Template",
        flags: { isLocked: false, isFavorite: true },
      },
      fields: [
        { id: 1, title: "Prompt", type: "text" },
      ],
      dueAt: new Date("2024-01-02T00:00:00.000Z"),
      untouched: 1,
    });
  });

  it("maps object properties in both directions", () => {
    const mapping = { firstName: "first_name", lastName: "last_name" };
    const mapped = mapObjectProperties({ firstName: "John", lastName: "Doe" }, mapping);

    expect(mapped).toEqual({
      first_name: "John",
      last_name: "Doe",
    });
    expect(mapObjectPropertiesReverse(mapped, mapping)).toEqual({
      firstName: "John",
      lastName: "Doe",
    });
  });
});
