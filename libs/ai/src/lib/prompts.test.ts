import { describe, expect, it } from "vitest";
import { compilePromptTemplate, DEFAULT_CHAT_PROMPT_TEMPLATE } from "./prompts";

const FIELDS = [
  { id: 1, title: "Front", isRequired: true, type: "text" },
  { id: 2, title: "Back", isRequired: true, type: "text" },
];

describe("DEFAULT_CHAT_PROMPT_TEMPLATE", () => {
  it("tells the model to invent cards via propose_cards instead of picking existing ones", () => {
    expect(DEFAULT_CHAT_PROMPT_TEMPLATE).toContain("propose_cards");
    expect(DEFAULT_CHAT_PROMPT_TEMPLATE).toMatch(/random card/i);
    expect(DEFAULT_CHAT_PROMPT_TEMPLATE).toMatch(/invent/i);
    expect(DEFAULT_CHAT_PROMPT_TEMPLATE).toContain("list_decks");
    expect(DEFAULT_CHAT_PROMPT_TEMPLATE).toMatch(/do not ask the user for field titles/i);
    expect(DEFAULT_CHAT_PROMPT_TEMPLATE).toMatch(/do not restate the cards/i);
    expect(DEFAULT_CHAT_PROMPT_TEMPLATE).toMatch(/markdown table/i);
    expect(DEFAULT_CHAT_PROMPT_TEMPLATE).toMatch(/0 cards/i);
    expect(DEFAULT_CHAT_PROMPT_TEMPLATE).toMatch(/short note/i);
    expect(DEFAULT_CHAT_PROMPT_TEMPLATE).not.toMatch(/call list_decks and get_deck_cards first/i);
    expect(DEFAULT_CHAT_PROMPT_TEMPLATE).not.toMatch(/currently selected deck/i);
  });
});

describe("compilePromptTemplate", () => {
  it("does not bake a selected deck into the compiled prompt", () => {
    const compiled = compilePromptTemplate("Hello.", FIELDS, null);
    expect(compiled).toBe("Hello.");
    expect(compiled).not.toMatch(/currently selected deck/);
    expect(compiled).not.toMatch(/this deck/);
  });
});
