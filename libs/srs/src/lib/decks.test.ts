import { describe, expect, it } from "vitest";
import { deckValidation } from "./decks";

const ID = "01900000-0000-7000-8000-000000000001";

function validDeck() {
  return { id: ID, title: "German", algorithmId: ID, templateId: ID };
}

// Twin of `crates/koloda/tests/domain/decks_validation_tests.rs` — the Rust
// side reports dedicated `validation.decks.*` codes for these shapes; the TS
// side rejects them via `z.uuid()` before any existence check runs.
describe("deckValidation references", () => {
  it("accepts well-formed uuid references", () => {
    expect(deckValidation.safeParse(validDeck()).success).toBe(true);
  });

  it.each([
    { name: "malformed algorithmId", payload: { ...validDeck(), algorithmId: "not-a-uuid" } },
    { name: "non-uuid templateId", payload: { ...validDeck(), templateId: "simple" } },
    { name: "hyphenless algorithmId", payload: { ...validDeck(), algorithmId: "01900000000070008000000000000001" } },
    { name: "empty templateId", payload: { ...validDeck(), templateId: "" } },
  ])("rejects $name", ({ payload }) => {
    const result = deckValidation.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
