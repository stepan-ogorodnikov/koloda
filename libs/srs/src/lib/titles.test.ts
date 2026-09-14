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
});
