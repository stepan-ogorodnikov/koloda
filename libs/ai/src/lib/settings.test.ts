import { describe, expect, it } from "vitest";
import {
  aiProfileValidation,
  aiSettingsValidation,
  assistantSettingsValidation,
  findDuplicateProfileId,
  resolveChatPromptMode,
  resolveEffectiveChatPromptTemplate,
} from "./settings";
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

describe("aiProfileValidation whitelistModelIds", () => {
  const base = { id: "00000000-0000-0000-0000-000000000000", createdAt: "2026-01-01T00:00:00Z" };

  it("leaves the field unset when omitted", () => {
    const parsed = aiProfileValidation.parse(base);
    expect(parsed.whitelistModelIds).toBeUndefined();
  });

  it("accepts a list of model ids", () => {
    const parsed = aiProfileValidation.parse({ ...base, whitelistModelIds: ["openai/gpt-4"] });
    expect(parsed.whitelistModelIds).toEqual(["openai/gpt-4"]);
  });

  it("accepts an empty list", () => {
    const parsed = aiProfileValidation.parse({ ...base, whitelistModelIds: [] });
    expect(parsed.whitelistModelIds).toEqual([]);
  });

  it("rejects empty model ids", () => {
    expect(() => aiProfileValidation.parse({ ...base, whitelistModelIds: [""] })).toThrow();
  });
});

describe("aiProfileValidation id", () => {
  const base = { createdAt: "2026-01-01T00:00:00Z" };

  it("accepts a UUIDv7-shaped id", () => {
    const parsed = aiProfileValidation.parse({ ...base, id: "01900000-0000-7000-8000-000000000001" });
    expect(parsed.id).toBe("01900000-0000-7000-8000-000000000001");
  });

  it("rejects a non-UUID id", () => {
    const result = aiProfileValidation.safeParse({ ...base, id: "not-a-uuid" });
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    expect(issue?.path).toEqual(["id"]);
  });

  it("rejects a hyphenless UUID-shaped id", () => {
    // WHY: `uuid::Uuid::parse_str` accepts this form; the Rust twin of `z.uuid()`
    // must reject it too so desktop cannot persist an id the web schema rejects.
    const result = aiProfileValidation.safeParse({ ...base, id: "01900000000070008000000000000001" });
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    expect(issue?.path).toEqual(["id"]);
  });
});

describe("assistantSettingsValidation", () => {
  it("strips leftover cardsPromptTemplate from old saved settings", () => {
    const parsed = assistantSettingsValidation.parse({
      temperature: 0.2,
      cardsPromptTemplate: "old generation template",
      chatPromptTemplate: null,
    });
    expect(parsed).toEqual({ temperature: 0.2, chatPromptTemplate: null });
    expect(parsed).not.toHaveProperty("cardsPromptTemplate");
    expect(parsed).not.toHaveProperty("chatPromptMode");
  });

  it("keeps an omitted chatPromptMode unset when a custom template is stored", () => {
    const parsed = assistantSettingsValidation.parse({
      temperature: 0.2,
      chatPromptTemplate: "mine",
    });
    expect(parsed.chatPromptMode).toBeUndefined();
    expect(parsed.chatPromptTemplate).toBe("mine");
  });

  it("keeps an explicit default mode with a stored custom template", () => {
    const parsed = assistantSettingsValidation.parse({
      temperature: 0.2,
      chatPromptTemplate: "mine",
      chatPromptMode: "default",
    });
    expect(parsed).toEqual({
      temperature: 0.2,
      chatPromptTemplate: "mine",
      chatPromptMode: "default",
    });
  });

  it("accepts an empty custom template", () => {
    const parsed = assistantSettingsValidation.parse({
      temperature: 0.2,
      chatPromptTemplate: "",
      chatPromptMode: "custom",
    });
    expect(parsed.chatPromptTemplate).toBe("");
    expect(parsed.chatPromptMode).toBe("custom");
  });
});

describe("resolveChatPromptMode", () => {
  it.each([
    {
      name: "omitted mode and null template infers default",
      input: { chatPromptTemplate: null },
      mode: "default",
      effective: null,
    },
    {
      name: "omitted mode and a string infers custom",
      input: { chatPromptTemplate: "mine" },
      mode: "custom",
      effective: "mine",
    },
    {
      name: "explicit default ignores a stored custom string",
      input: { chatPromptMode: "default" as const, chatPromptTemplate: "mine" },
      mode: "default",
      effective: null,
    },
    {
      name: "explicit custom with null template sends empty",
      input: { chatPromptMode: "custom" as const, chatPromptTemplate: null },
      mode: "custom",
      effective: "",
    },
    {
      name: "explicit custom with empty string sends empty",
      input: { chatPromptMode: "custom" as const, chatPromptTemplate: "" },
      mode: "custom",
      effective: "",
    },
  ] as const)("$name", ({ input, mode, effective }) => {
    expect(resolveChatPromptMode(input)).toBe(mode);
    expect(resolveEffectiveChatPromptTemplate(input)).toBe(effective);
  });
});
