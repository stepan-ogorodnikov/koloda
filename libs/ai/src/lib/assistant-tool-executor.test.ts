import { describe, expect, it } from "vitest";
import { createAssistantToolExecutor } from "./assistant-tool-executor";

const template = {
  id: 5,
  title: "Basic",
  content: {
    fields: [
      { id: 1, title: "Front", type: "text" as const, isRequired: true },
      { id: 2, title: "Back", type: "text" as const, isRequired: true },
    ],
    layout: [{ field: 1, operation: "display" as const }],
  },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  isLocked: false,
};

function makeDataSource(overrides: Partial<Parameters<typeof createAssistantToolExecutor>[0]> = {}) {
  const data = {
    getDecks: () => [{ id: 1, title: "Spanish", templateId: 5 }],
    getTemplates: () => [template],
    getCards: () => [{ id: 9, deckId: 1, templateId: 5, content: { "1": { text: "hola" } } }],
    getCardCounts: () => ({ 1: 3 }),
  };
  return { ...data, ...overrides };
}

describe("createAssistantToolExecutor", () => {
  it("list_decks shapes deck rows with counts from the data source", async () => {
    const executor = createAssistantToolExecutor(makeDataSource());
    const output = (await executor("list_decks", {})) as { decks: Array<{ deckId: number; cardCount: number }> };
    expect(output.decks[0]).toMatchObject({ deckId: 1, cardCount: 3 });
  });

  it("list_decks reports zero for a deck without cards", async () => {
    const executor = createAssistantToolExecutor(makeDataSource({ getCardCounts: () => ({}) }));
    const output = (await executor("list_decks", {})) as { decks: Array<{ deckId: number; cardCount: number }> };
    expect(output.decks[0]?.cardCount).toBe(0);
  });

  it("get_deck_cards throws for a missing deck", async () => {
    const executor = createAssistantToolExecutor(makeDataSource());
    await expect(executor("get_deck_cards", { deckId: 999 })).rejects.toThrow("Deck not found: 999");
  });

  it("get_deck_cards throws when the deck's template is missing", async () => {
    const executor = createAssistantToolExecutor(
      makeDataSource({ getDecks: () => [{ id: 1, title: "Spanish", templateId: 404 }] }),
    );
    await expect(executor("get_deck_cards", { deckId: 1 })).rejects.toThrow("Template not found for deck: 1");
  });

  it("propose_cards shapes accepted cards through the write target", async () => {
    const executor = createAssistantToolExecutor(makeDataSource());
    const output = (await executor("propose_cards", {
      deckId: 1,
      cards: [{ fields: { "1": "Front", "2": "Back" } }],
    })) as { deckId: number };
    expect(output.deckId).toBe(1);
  });

  it("propose_cards drops mixed invalid cards instead of throwing", async () => {
    const executor = createAssistantToolExecutor(makeDataSource());
    const output = (await executor("propose_cards", {
      deckId: 1,
      cards: [
        { fields: { Front: "hola", Back: "hello" } },
        { fields: { Front: "gato", Back: 1 } },
        { fields: { Front: "x", Back: [] } },
        "not-an-object",
      ],
    })) as { cards: Array<{ fields: Record<string, string> }>; rejectedCount: number };

    expect(output.cards).toEqual([
      { fields: { Front: "hola", Back: "hello" } },
      { fields: { Front: "gato", Back: "1" } },
    ]);
    expect(output.rejectedCount).toBe(2);
  });

  it("rejects unknown tool names", async () => {
    const executor = createAssistantToolExecutor(makeDataSource());
    await expect(executor("delete_everything", {})).rejects.toThrow("Unknown assistant tool: delete_everything");
  });
});
