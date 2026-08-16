import type { Template } from "@koloda/srs";
import { describe, expect, it } from "vitest";
import { createCard, createDeck, createTemplate } from "../../../test/test-helpers";
import type { DataAccessCard, DataAccessDeckCardsInput, DataAccessDeckSummaryInput } from "./data-access";
import {
  DATA_ACCESS_CARD_LIST_CHAR_BUDGET,
  DATA_ACCESS_MAX_CARDS_PER_DECK,
  serializeDeckCards,
  serializeDeckSummaries,
} from "./data-access";

function summaryDeck(id: number, title: string, templateId: number, cardCount: number): DataAccessDeckSummaryInput {
  return { id, title, templateId, cardCount };
}

function cardsDeck(template: Template): DataAccessDeckCardsInput {
  const deck = createDeck();
  return { id: deck.id, title: deck.title, template };
}

function makeCard(front: string, back: string): DataAccessCard {
  return { content: { "1": { text: front }, "2": { text: back } } };
}

describe("serializeDeckSummaries", () => {
  it("serializes each deck as one line with name, card count, and template", () => {
    const verbs = createTemplate({
      id: 7,
      title: "Verbs",
      content: {
        fields: [
          { id: 1, title: "Word", isRequired: true, type: "text" },
          { id: 2, title: "Reading", isRequired: true, type: "text" },
          { id: 3, title: "Meaning", isRequired: true, type: "text" },
        ],
      },
    });

    const result = serializeDeckSummaries(
      [summaryDeck(1, "Spanish", 1, 120), summaryDeck(7, "Kanji", 7, 3)],
      [createTemplate(), verbs],
    );

    expect(result.context).toBe(
      [
        "User decks:",
        "- Deck: Spanish — 120 cards — Template: Default (Front, Back)",
        "- Deck: Kanji — 3 cards — Template: Verbs (Word, Reading, Meaning)",
      ].join("\n"),
    );
  });

  it("manifest decks mirror the serialized lines", () => {
    const result = serializeDeckSummaries(
      [summaryDeck(1, "Spanish", 1, 120), summaryDeck(7, "Kanji", 7, 3)],
      [createTemplate(), createTemplate({ id: 7, title: "Verbs" })],
    );

    expect(result.decks).toEqual([
      { deckId: 1, title: "Spanish", cardCount: 120, templateTitle: "Default" },
      { deckId: 7, title: "Kanji", cardCount: 3, templateTitle: "Verbs" },
    ]);
  });

  it("returns empty context and manifest when the user has no decks", () => {
    expect(serializeDeckSummaries([], [createTemplate()])).toEqual({ context: "", decks: [] });
  });

  it("records a deck without a template as unknown", () => {
    const result = serializeDeckSummaries([summaryDeck(1, "Spanish", 99, 5)], [createTemplate()]);

    expect(result.context).toBe("User decks:\n- Deck: Spanish — 5 cards — Template: unknown");
    expect(result.decks).toEqual([{ deckId: 1, title: "Spanish", cardCount: 5, templateTitle: null }]);
  });
});

describe("serializeDeckCards", () => {
  it("serializes count, fronts, and full fields while the budget allows", () => {
    const result = serializeDeckCards(
      cardsDeck(createTemplate()),
      [makeCard("Question", "Answer"), makeCard("Bonjour", "Hello")],
      DATA_ACCESS_CARD_LIST_CHAR_BUDGET,
    );

    expect(result.context).toBe(
      [
        "Existing cards in deck Default Deck (2 total):",
        "1. Front: Question | Back: Answer",
        "2. Front: Bonjour | Back: Hello",
      ].join("\n"),
    );
    expect(result.writeTarget).toEqual({
      isMissing: false,
      deckId: 1,
      title: "Default Deck",
      totalCards: 2,
      listedCards: 2,
      fullFieldCards: 2,
      isCapped: false,
      isTruncated: false,
    });
  });

  it("uses the template's first field as the card front", () => {
    const template = createTemplate({
      content: {
        fields: [
          { id: 2, title: "Word", isRequired: true, type: "text" },
          { id: 1, title: "Definition", isRequired: true, type: "text" },
        ],
      },
    });
    const card = createCard({ content: { "2": { text: "cat" }, "1": { text: "a small pet" } } });

    const result = serializeDeckCards(cardsDeck(template), [{ content: card.content }], 1_000);

    expect(result.context).toBe(
      ["Existing cards in deck Default Deck (1 total):", "1. Word: cat | Definition: a small pet"].join("\n"),
    );
  });

  it("caps the card list at the per-deck maximum and records the cap", () => {
    const total = DATA_ACCESS_MAX_CARDS_PER_DECK + 5;
    const cards = Array.from({ length: total }, (_, i) => makeCard(`c${i + 1}`, `c${i + 1} back`));

    const result = serializeDeckCards(cardsDeck(createTemplate()), cards, 1_000_000);

    const lines = result.context.split("\n");
    expect(lines[0]).toBe(`Existing cards in deck Default Deck (${total} total):`);
    expect(lines[1]).toBe("1. Front: c1 | Back: c1 back");
    expect(lines[DATA_ACCESS_MAX_CARDS_PER_DECK]).toBe(
      `${DATA_ACCESS_MAX_CARDS_PER_DECK}. Front: c${DATA_ACCESS_MAX_CARDS_PER_DECK} | Back: c${DATA_ACCESS_MAX_CARDS_PER_DECK} back`,
    );
    expect(lines).toHaveLength(DATA_ACCESS_MAX_CARDS_PER_DECK + 2);
    expect(lines.at(-1)).toBe(`Only the first ${DATA_ACCESS_MAX_CARDS_PER_DECK} of ${total} cards are listed.`);
    expect(result.writeTarget).toMatchObject({
      totalCards: total,
      listedCards: DATA_ACCESS_MAX_CARDS_PER_DECK,
      fullFieldCards: DATA_ACCESS_MAX_CARDS_PER_DECK,
      isCapped: true,
      isTruncated: false,
    });
  });

  it("degrades later cards to front-only lines when the budget runs out", () => {
    // Front lines are 2 chars each (3 with separator); each full-field upgrade adds 18.
    // Budget 23 fits both fronts plus exactly one upgrade.
    const result = serializeDeckCards(cardsDeck(createTemplate()), [makeCard("f1", "b1"), makeCard("f2", "b2")], 23);

    expect(result.context).toBe(
      [
        "Existing cards in deck Default Deck (2 total):",
        "1. Front: f1 | Back: b1",
        "2. f2",
        "Full fields shown for 1 of 2 listed cards (context budget).",
      ].join("\n"),
    );
    expect(result.writeTarget).toMatchObject({
      listedCards: 2,
      fullFieldCards: 1,
      isCapped: false,
      isTruncated: true,
    });
  });

  it("cuts the front list when the budget cannot fit all fronts", () => {
    const result = serializeDeckCards(cardsDeck(createTemplate()), [makeCard("f1", "b1"), makeCard("f2", "b2")], 3);

    expect(result.context).toBe(
      [
        "Existing cards in deck Default Deck (2 total):",
        "1. f1",
        "Context budget reached: 1 of 2 cards listed.",
        "Full fields shown for 0 of 1 listed cards (context budget).",
      ].join("\n"),
    );
    expect(result.writeTarget).toMatchObject({
      listedCards: 1,
      fullFieldCards: 0,
      isCapped: false,
      isTruncated: true,
    });
  });

  it("still yields the count line at zero budget", () => {
    const result = serializeDeckCards(
      cardsDeck(createTemplate()),
      [makeCard("f1", "b1"), makeCard("f2", "b2"), makeCard("f3", "b3")],
      0,
    );

    expect(result.context).toBe(
      ["Existing cards in deck Default Deck (3 total):", "Context budget reached: 0 of 3 cards listed."].join("\n"),
    );
    expect(result.writeTarget).toMatchObject({
      totalCards: 3,
      listedCards: 0,
      fullFieldCards: 0,
      isCapped: false,
      isTruncated: true,
    });
  });

  it("serializes an empty deck as the count line only", () => {
    const result = serializeDeckCards(cardsDeck(createTemplate()), [], DATA_ACCESS_CARD_LIST_CHAR_BUDGET);

    expect(result.context).toBe("Existing cards in deck Default Deck (0 total):");
    expect(result.writeTarget).toMatchObject({
      totalCards: 0,
      listedCards: 0,
      fullFieldCards: 0,
      isCapped: false,
      isTruncated: false,
    });
  });

  it("records a deleted write target as missing with no context", () => {
    const result = serializeDeckCards(null, [makeCard("f1", "b1")], DATA_ACCESS_CARD_LIST_CHAR_BUDGET);

    expect(result.context).toBe("");
    expect(result.writeTarget).toEqual({ isMissing: true });
  });

  it("manifest counts match what the text actually contains", () => {
    // Front pass costs 2 + 3 + 3 + 3 = 11 chars; each upgrade adds 18.
    // Budget 47 fits all four fronts plus two upgrades.
    const cards = [makeCard("f1", "b1"), makeCard("f2", "b2"), makeCard("f3", "b3"), makeCard("f4", "b4")];

    const result = serializeDeckCards(cardsDeck(createTemplate()), cards, 47);

    const listLines = result.context.split("\n").filter((line) => /^\d+\. /.test(line));
    expect(listLines).toHaveLength(4);
    expect(listLines.filter((line) => line.includes(" | "))).toHaveLength(2);
    expect(result.writeTarget).toMatchObject({ listedCards: 4, fullFieldCards: 2, isTruncated: true });
  });
});
