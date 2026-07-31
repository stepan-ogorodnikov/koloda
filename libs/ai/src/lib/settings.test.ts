import { describe, expect, it } from "vitest";
import { aiSettingsValidation, findDuplicateProfileId } from "./settings";
import type { AISettings } from "./settings";

describe("findDuplicateProfileId", () => {
  it("returns null when all profile ids are unique", () => {
    const settings: AISettings = {
      profiles: [
        { id: "a", title: undefined, createdAt: "2026-01-01T00:00:00Z" },
        { id: "b", title: undefined, createdAt: "2026-01-01T00:00:00Z" },
      ],
    };
    expect(findDuplicateProfileId(settings)).toBeNull();
  });

  it("returns null for an empty profiles array", () => {
    expect(findDuplicateProfileId({ profiles: [] })).toBeNull();
  });

  it("returns the id of the first duplicate when ids collide", () => {
    const dup = "00000000-0000-0000-0000-000000000000";
    const settings: AISettings = {
      profiles: [
        { id: dup, title: "First", createdAt: "2026-01-01T00:00:00Z" },
        { id: dup, title: "Second", createdAt: "2026-01-01T00:00:00Z" },
      ],
    };
    expect(findDuplicateProfileId(settings)).toBe(dup);
  });

  it("accepts the parsed output of aiSettingsValidation", () => {
    // Defense-in-depth parity with Rust: the validator runs on the parsed
    // content at the add/update boundary, where field-level zod parsing has
    // already succeeded.
    const dup = "00000000-0000-0000-0000-000000000000";
    const parsed = aiSettingsValidation.parse({
      profiles: [
        { id: dup, createdAt: "2026-01-01T00:00:00Z" },
        { id: dup, createdAt: "2026-01-01T00:00:00Z" },
      ],
    });
    expect(findDuplicateProfileId(parsed)).toBe(dup);
  });
});
