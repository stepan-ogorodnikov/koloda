import { describe, expect, it } from "vitest";
import { algorithmValidation } from "./algorithms";
import { DEFAULT_FSRS_ALGORITHM } from "./algorithms-fsrs";
import { deckValidation } from "./decks";
import { templateValidation } from "./templates";

const ID = "01900000-0000-7000-8000-000000000001";

const TEMPLATE_CONTENT = {
  fields: [{ id: ID, title: "Front", type: "text" as const, isRequired: true }],
  layout: [{ field: ID, operation: "display" as const }],
};

const TITLE_SCHEMAS = [
  {
    name: "deckValidation",
    parse: (title: string) => deckValidation.safeParse({ id: ID, title, algorithmId: ID, templateId: ID }),
  },
  {
    name: "algorithmValidation",
    parse: (title: string) => algorithmValidation.safeParse({ id: ID, title, content: DEFAULT_FSRS_ALGORITHM }),
  },
  {
    name: "templateValidation",
    parse: (title: string) => templateValidation.safeParse({ id: ID, title, content: TEMPLATE_CONTENT }),
  },
] as const;

// WHY: titles count UTF-16 units (JS `.length`); the Rust twin counts UTF-16
// explicitly (`validate_title` in `domain/common.rs`) — byte or char counting
// would diverge on the Cyrillic and astral rows. Twin of
// `crates/koloda/tests/domain/decks_title_tests.rs`.
describe.each(TITLE_SCHEMAS)("$name title bounds", ({ parse }) => {
  it.each([
    { name: "accepts a title at the 255-unit limit", title: "a".repeat(255) },
    { name: "accepts 255 Cyrillic chars as 255 units", title: "ф".repeat(255) },
    { name: "accepts 127 emoji as 254 UTF-16 units", title: "🦀".repeat(127) },
  ])("$name", ({ title }) => {
    expect(parse(title).success).toBe(true);
  });

  it.each([
    { name: "rejects 128 emoji as 256 UTF-16 units", title: "🦀".repeat(128) },
    { name: "rejects a title one past the limit", title: "ф".repeat(256) },
  ])("$name", ({ title }) => {
    const result = parse(title);
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    expect(issue?.path).toEqual(["title"]);
    expect(issue?.message).toBe("validation.common.title.too-long");
  });

  it("rejects an empty title", () => {
    const result = parse("");
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    expect(issue?.path).toEqual(["title"]);
    expect(issue?.message).toBe("validation.common.title.too-short");
  });

  it("rejects a whitespace-only title", () => {
    const result = parse("   ");
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    expect(issue?.path).toEqual(["title"]);
    expect(issue?.message).toBe("validation.common.title.too-short");
  });

  it("trims leading and trailing whitespace from accepted titles", () => {
    const result = parse("  Deck name  ");
    expect(result.success).toBe(true);
    expect(result.data!.title).toBe("Deck name");
  });
});

// WHY: notes are optional plain text at the boundary both hosts call — trim,
// whitespace-only becomes absent, max 1024 UTF-16 units. Undefined input stays
// undefined so insert paths that omit the field keep the column NULL. Twin of
// `crates/koloda/tests/domain/entity_notes_tests.rs`.
const NOTES_SCHEMAS = [
  {
    name: "deckValidation",
    parse: (notes: unknown) =>
      deckValidation.safeParse({ id: ID, title: "German", algorithmId: ID, templateId: ID, notes }),
  },
  {
    name: "algorithmValidation",
    parse: (notes: unknown) =>
      algorithmValidation.safeParse({ id: ID, title: "FSRS", content: DEFAULT_FSRS_ALGORITHM, notes }),
  },
  {
    name: "templateValidation",
    parse: (notes: unknown) =>
      templateValidation.safeParse({ id: ID, title: "Basic", content: TEMPLATE_CONTENT, notes }),
  },
] as const;

describe.each(NOTES_SCHEMAS)("$name notes", ({ parse }) => {
  it("keeps notes undefined when the field is omitted", () => {
    const result = parse(undefined);
    expect(result.success).toBe(true);
    expect(result.data!.notes).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    const result = parse("  Use this preset for vocabulary, not cramming  ");
    expect(result.success).toBe(true);
    expect(result.data!.notes).toBe("Use this preset for vocabulary, not cramming");
  });

  it("normalizes whitespace-only notes to undefined", () => {
    const result = parse("   ");
    expect(result.success).toBe(true);
    expect(result.data!.notes).toBeUndefined();
  });

  it("treats null notes as absent on the DB round-trip", () => {
    const result = parse(undefined);
    expect(result.success).toBe(true);
    expect(result.data!.notes).toBeUndefined();
  });

  it("accepts notes of exactly 1024 characters", () => {
    const result = parse("a".repeat(1024));
    expect(result.success).toBe(true);
    expect(result.data!.notes).toHaveLength(1024);
  });

  it("rejects notes over 1024 characters with the shared message", () => {
    const result = parse("a".repeat(1025));
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    expect(issue?.path).toEqual(["notes"]);
    expect(issue?.message).toBe("validation.common.notes.too-long");
  });
});
