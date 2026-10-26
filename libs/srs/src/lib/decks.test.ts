import { describe, expect, it } from "vitest";
import { deckValidation } from "./decks";

const ID = "01900000-0000-7000-8000-000000000001";

function validDeck() {
  return { id: ID, title: "German", algorithmId: ID, templateId: ID };
}

// Twin of `crates/koloda/tests/domain/decks_validation_tests.rs`: both sides report the
// dedicated `validation.decks.*` codes before any existence check runs.
describe("deckValidation references", () => {
  it("accepts well-formed uuid references", () => {
    expect(deckValidation.safeParse(validDeck()).success).toBe(true);
  });

  it.each([
    {
      name: "malformed algorithmId",
      payload: { ...validDeck(), algorithmId: "not-a-uuid" },
      code: "validation.decks.algorithm",
    },
    {
      name: "non-uuid templateId",
      payload: { ...validDeck(), templateId: "simple" },
      code: "validation.decks.template",
    },
    {
      name: "hyphenless algorithmId",
      payload: { ...validDeck(), algorithmId: "01900000000070008000000000000001" },
      code: "validation.decks.algorithm",
    },
    { name: "empty templateId", payload: { ...validDeck(), templateId: "" }, code: "validation.decks.template" },
  ])("rejects $name with its code", ({ payload, code }) => {
    const result = deckValidation.safeParse(payload);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([code]);
  });
});

// Twin of `crates/koloda/tests/domain/entity_notes_tests.rs` — notes are optional
// plain text: trim, whitespace-only becomes absent, max 1024 UTF-16 units.
describe("deckValidation notes", () => {
  it("leaves notes absent when the field is omitted", () => {
    const result = deckValidation.parse(validDeck());
    expect(result.notes).toBeUndefined();
  });

  it("treats null notes as absent (DB round-trip)", () => {
    const result = deckValidation.safeParse({ ...validDeck(), notes: null });
    expect(result.success).toBe(true);
    expect(result.success ? result.data.notes : undefined).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    const result = deckValidation.parse({ ...validDeck(), notes: "  For vocabulary, not cramming  " });
    expect(result.notes).toBe("For vocabulary, not cramming");
  });

  it("stores whitespace-only notes as absent", () => {
    const result = deckValidation.parse({ ...validDeck(), notes: "   " });
    expect(result.notes).toBeUndefined();
  });

  it("accepts notes of exactly 1024 characters", () => {
    const result = deckValidation.parse({ ...validDeck(), notes: "x".repeat(1024) });
    expect(result.notes).toHaveLength(1024);
  });

  it("rejects notes over 1024 characters", () => {
    const result = deckValidation.safeParse({ ...validDeck(), notes: "x".repeat(1025) });
    expect(result.success).toBe(false);
  });
});
