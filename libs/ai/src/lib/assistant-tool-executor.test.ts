import { describe, expect, it, vi } from "vitest";
import { createAssistantToolExecutor } from "./assistant-tool-executor";

const DECK_ID = "01900000-0000-7000-8000-000000000001";
const TEMPLATE_ID = "01900000-0000-7000-8000-000000000005";
const MISSING_DECK_ID = "01900000-0000-7000-8000-0000000003e7";
const MISSING_TEMPLATE_ID = "01900000-0000-7000-8000-000000000194";
const FRONT_ID = "01900000-0000-7000-8000-000000000001";
const BACK_ID = "01900000-0000-7000-8000-000000000002";

const template = {
  id: TEMPLATE_ID,
  title: "Basic",
  content: {
    fields: [
      { id: FRONT_ID, title: "Front", type: "text" as const, isRequired: true },
      { id: BACK_ID, title: "Back", type: "text" as const, isRequired: true },
    ],
    layout: [{ field: FRONT_ID, operation: "display" as const }],
  },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  isLocked: false,
};

const ALGORITHM_ID = "01900000-0000-7000-8000-000000000031";

const algorithm = {
  id: ALGORITHM_ID,
  title: "Default",
  content: {
    type: "fsrs" as const,
    retention: 90,
    weights: "0.212, 1.2931",
    isFuzzEnabled: true,
    learningSteps: [[1, "m"] as [number, string], [10, "m"] as [number, string]],
    relearningSteps: [[10, "m"] as [number, string]],
    maximumInterval: 36500,
  },
};

function makeDataSource(overrides: Partial<Parameters<typeof createAssistantToolExecutor>[0]> = {}) {
  const data = {
    getDecks: () => [{ id: DECK_ID, title: "Spanish", templateId: TEMPLATE_ID }],
    getTemplates: () => [template],
    getAlgorithms: () => [algorithm],
    getCards: () => [
      {
        id: "01900000-0000-7000-8000-000000000009",
        deckId: DECK_ID,
        templateId: TEMPLATE_ID,
        content: { [FRONT_ID]: { text: "hola" } },
      },
    ],
    getCardCounts: () => ({ [DECK_ID]: 3 }),
    getDefaultAlgorithmId: () => ALGORITHM_ID,
    createDeck: () => {
      throw new Error("createDeck should not be called");
    },
  };
  return { ...data, ...overrides };
}

describe("createAssistantToolExecutor", () => {
  it("list_decks shapes deck rows with counts from the data source", async () => {
    const executor = createAssistantToolExecutor(makeDataSource());
    const output = (await executor("list_decks", {})) as { decks: Array<{ deckId: string; cardCount: number }> };
    expect(output.decks[0]).toMatchObject({ deckId: DECK_ID, cardCount: 3 });
  });

  it("list_decks reports zero for a deck without cards", async () => {
    const executor = createAssistantToolExecutor(makeDataSource({ getCardCounts: () => ({}) }));
    const output = (await executor("list_decks", {})) as { decks: Array<{ deckId: string; cardCount: number }> };
    expect(output.decks[0]?.cardCount).toBe(0);
  });

  it("list_templates shapes template rows from the data source", async () => {
    const executor = createAssistantToolExecutor(makeDataSource());
    const output = (await executor("list_templates", {})) as {
      templates: Array<{ templateId: string; title: string; fieldTitles: string[] }>;
    };
    expect(output.templates).toEqual([{ templateId: TEMPLATE_ID, title: "Basic", fieldTitles: ["Front", "Back"] }]);
  });

  it("list_templates returns an empty list when there are no templates", async () => {
    const executor = createAssistantToolExecutor(makeDataSource({ getTemplates: () => [] }));
    const output = (await executor("list_templates", {})) as { templates: unknown[] };
    expect(output.templates).toEqual([]);
  });

  it("list_algorithms shapes algorithm rows from the data source", async () => {
    const executor = createAssistantToolExecutor(makeDataSource());
    const output = (await executor("list_algorithms", {})) as {
      algorithms: Array<{ algorithmId: string; title: string; content: { retention: number } }>;
    };
    expect(output.algorithms).toEqual([{ algorithmId: ALGORITHM_ID, title: "Default", content: algorithm.content }]);
  });

  it("list_algorithms returns an empty list when there are no algorithms", async () => {
    const executor = createAssistantToolExecutor(makeDataSource({ getAlgorithms: () => [] }));
    const output = (await executor("list_algorithms", {})) as { algorithms: unknown[] };
    expect(output.algorithms).toEqual([]);
  });

  it("get_deck shapes one deck row without reading cards", async () => {
    let cardReads = 0;
    const executor = createAssistantToolExecutor(
      makeDataSource({
        getCards: () => {
          cardReads += 1;
          return [];
        },
      }),
    );
    const output = await executor("get_deck", { deckId: DECK_ID });
    expect(output).toEqual({
      deckId: DECK_ID,
      title: "Spanish",
      cardCount: 3,
      templateTitle: "Basic",
      fieldTitles: ["Front", "Back"],
    });
    expect(cardReads).toBe(0);
  });

  it("get_deck throws for a missing deck without reading cards", async () => {
    let cardReads = 0;
    const executor = createAssistantToolExecutor(
      makeDataSource({
        getCards: () => {
          cardReads += 1;
          return [];
        },
      }),
    );
    await expect(executor("get_deck", { deckId: MISSING_DECK_ID })).rejects.toThrow(
      `Deck not found: ${MISSING_DECK_ID}`,
    );
    expect(cardReads).toBe(0);
  });

  it("get_deck keeps a null template title when the deck's template is missing", async () => {
    let cardReads = 0;
    const executor = createAssistantToolExecutor(
      makeDataSource({
        getDecks: () => [{ id: DECK_ID, title: "Spanish", templateId: MISSING_TEMPLATE_ID }],
        getCards: () => {
          cardReads += 1;
          return [];
        },
      }),
    );
    await expect(executor("get_deck", { deckId: DECK_ID })).resolves.toEqual({
      deckId: DECK_ID,
      title: "Spanish",
      cardCount: 3,
      templateTitle: null,
      fieldTitles: [],
    });
    expect(cardReads).toBe(0);
  });

  it("get_template shapes full field metadata without reading decks or cards", async () => {
    let deckReads = 0;
    let cardReads = 0;
    const executor = createAssistantToolExecutor(
      makeDataSource({
        getDecks: () => {
          deckReads += 1;
          return [{ id: DECK_ID, title: "Spanish", templateId: TEMPLATE_ID }];
        },
        getCards: () => {
          cardReads += 1;
          return [];
        },
      }),
    );
    const output = await executor("get_template", { templateId: TEMPLATE_ID });
    expect(output).toEqual({
      templateId: TEMPLATE_ID,
      title: "Basic",
      fields: [
        { id: FRONT_ID, title: "Front", type: "text", isRequired: true },
        { id: BACK_ID, title: "Back", type: "text", isRequired: true },
      ],
    });
    expect(deckReads).toBe(0);
    expect(cardReads).toBe(0);
  });

  it("get_template throws for a missing template without reading decks or cards", async () => {
    let deckReads = 0;
    let cardReads = 0;
    const executor = createAssistantToolExecutor(
      makeDataSource({
        getDecks: () => {
          deckReads += 1;
          return [{ id: DECK_ID, title: "Spanish", templateId: TEMPLATE_ID }];
        },
        getCards: () => {
          cardReads += 1;
          return [];
        },
      }),
    );
    await expect(executor("get_template", { templateId: MISSING_TEMPLATE_ID })).rejects.toThrow(
      `Template not found: ${MISSING_TEMPLATE_ID}`,
    );
    expect(deckReads).toBe(0);
    expect(cardReads).toBe(0);
  });

  it("get_deck_cards throws for a missing deck", async () => {
    let cardReads = 0;
    const executor = createAssistantToolExecutor(
      makeDataSource({
        getCards: () => {
          cardReads += 1;
          return [];
        },
      }),
    );
    await expect(executor("get_deck_cards", { deckId: MISSING_DECK_ID })).rejects.toThrow(
      `Deck not found: ${MISSING_DECK_ID}`,
    );
    expect(cardReads).toBe(0);
  });

  it("get_deck_cards throws when the deck's template is missing", async () => {
    let cardReads = 0;
    const executor = createAssistantToolExecutor(
      makeDataSource({
        getDecks: () => [{ id: DECK_ID, title: "Spanish", templateId: MISSING_TEMPLATE_ID }],
        getCards: () => {
          cardReads += 1;
          return [];
        },
      }),
    );
    await expect(executor("get_deck_cards", { deckId: DECK_ID })).rejects.toThrow(
      `Template not found for deck: ${DECK_ID}`,
    );
    expect(cardReads).toBe(0);
  });

  it("add_deck returns the stored deck with field titles and does not read cards", async () => {
    const createdId = "01900000-0000-7000-8000-000000000099";
    let cardReads = 0;
    const createDeck = vi.fn((input: { title: string; templateId: string; algorithmId: string }) => ({
      id: createdId,
      ...input,
    }));
    const getDefaultAlgorithmId = vi.fn(() => ALGORITHM_ID);
    const executor = createAssistantToolExecutor(
      makeDataSource({
        createDeck,
        getDefaultAlgorithmId,
        getCards: () => {
          cardReads += 1;
          return [];
        },
      }),
    );

    const output = await executor("add_deck", {
      title: "  Spanish verbs  ",
      templateId: TEMPLATE_ID,
      algorithmId: ALGORITHM_ID,
    });

    expect(output).toEqual({
      deckId: createdId,
      title: "Spanish verbs",
      templateId: TEMPLATE_ID,
      templateTitle: "Basic",
      fieldTitles: ["Front", "Back"],
      algorithmId: ALGORITHM_ID,
    });
    expect(createDeck).toHaveBeenCalledTimes(1);
    expect(createDeck).toHaveBeenCalledWith({
      title: "Spanish verbs",
      templateId: TEMPLATE_ID,
      algorithmId: ALGORITHM_ID,
    });
    expect(getDefaultAlgorithmId).not.toHaveBeenCalled();
    expect(cardReads).toBe(0);
  });

  it("add_deck does not create a deck when the template is missing", async () => {
    const createDeck = vi.fn();
    const getDefaultAlgorithmId = vi.fn(() => ALGORITHM_ID);
    const executor = createAssistantToolExecutor(makeDataSource({ createDeck, getDefaultAlgorithmId }));

    await expect(executor("add_deck", { title: "Spanish", templateId: MISSING_TEMPLATE_ID })).rejects.toThrow(
      `Template not found: ${MISSING_TEMPLATE_ID}`,
    );
    expect(createDeck).not.toHaveBeenCalled();
    expect(getDefaultAlgorithmId).not.toHaveBeenCalled();
  });

  it("add_deck does not create a deck when the requested algorithm is missing", async () => {
    const missingAlgorithmId = "01900000-0000-7000-8000-000000000032";
    const createDeck = vi.fn();
    const getDefaultAlgorithmId = vi.fn(() => ALGORITHM_ID);
    const executor = createAssistantToolExecutor(makeDataSource({ createDeck, getDefaultAlgorithmId }));

    await expect(
      executor("add_deck", { title: "Spanish", templateId: TEMPLATE_ID, algorithmId: missingAlgorithmId }),
    ).rejects.toThrow(`Algorithm not found: ${missingAlgorithmId}`);
    expect(createDeck).not.toHaveBeenCalled();
    expect(getDefaultAlgorithmId).not.toHaveBeenCalled();
  });

  it("add_deck stores the default algorithm id when algorithmId is omitted", async () => {
    const createdId = "01900000-0000-7000-8000-000000000099";
    const createDeck = vi.fn((input: { title: string; templateId: string; algorithmId: string }) => ({
      id: createdId,
      ...input,
    }));
    const executor = createAssistantToolExecutor(makeDataSource({ createDeck }));

    const output = (await executor("add_deck", { title: "Spanish", templateId: TEMPLATE_ID })) as {
      algorithmId: string;
      deckId: string;
    };

    expect(createDeck).toHaveBeenCalledWith({
      title: "Spanish",
      templateId: TEMPLATE_ID,
      algorithmId: ALGORITHM_ID,
    });
    expect(output.deckId).toBe(createdId);
    expect(output.algorithmId).toBe(ALGORITHM_ID);
  });

  it("add_deck does not create a deck when the default algorithm is missing", async () => {
    const missingAlgorithmId = "01900000-0000-7000-8000-000000000032";
    const createDeck = vi.fn();
    const executor = createAssistantToolExecutor(
      makeDataSource({ createDeck, getDefaultAlgorithmId: () => missingAlgorithmId }),
    );

    await expect(executor("add_deck", { title: "Spanish", templateId: TEMPLATE_ID })).rejects.toThrow(
      `Algorithm not found: ${missingAlgorithmId}`,
    );
    expect(createDeck).not.toHaveBeenCalled();
  });

  it("add_deck does not create a deck when the title is blank", async () => {
    const createDeck = vi.fn();
    const executor = createAssistantToolExecutor(makeDataSource({ createDeck }));

    await expect(executor("add_deck", { title: "   ", templateId: TEMPLATE_ID })).rejects.toThrow();
    expect(createDeck).not.toHaveBeenCalled();
  });

  it("propose_cards shapes accepted cards through the write target", async () => {
    const executor = createAssistantToolExecutor(makeDataSource());
    const output = (await executor("propose_cards", {
      deckId: DECK_ID,
      cards: [{ fields: { [FRONT_ID]: "Front", [BACK_ID]: "Back" } }],
    })) as { deckId: string };
    expect(output.deckId).toBe(DECK_ID);
  });

  it("propose_cards drops mixed invalid cards instead of throwing", async () => {
    const executor = createAssistantToolExecutor(makeDataSource());
    const output = (await executor("propose_cards", {
      deckId: DECK_ID,
      cards: [
        { fields: { Front: "hola", Back: "hello" } },
        { fields: { Front: "gato", Back: 1 } },
        { fields: { Front: "x", Back: [] } },
        "not-an-object",
      ],
    })) as { cards: Array<{ fields: Record<string, string> }>; rejectedCount: number; message?: string };

    expect(output.cards).toEqual([
      { fields: { Front: "hola", Back: "hello" } },
      { fields: { Front: "gato", Back: "1" } },
      { fields: { Front: "x", Back: "" } },
    ]);
    expect(output.rejectedCount).toBe(1);
    expect(output.message).toMatch(/1 card was not accepted/);
  });

  it("rejects unknown tool names", async () => {
    const executor = createAssistantToolExecutor(makeDataSource());
    await expect(executor("delete_everything", {})).rejects.toThrow("Unknown assistant tool: delete_everything");
  });
});
