import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { Card, Deck, GetCardsParams, Template } from "@koloda/srs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import { createCard, createDeck, createTemplate } from "../../test/test-helpers";
import type { DataAccessSnapshot } from "./runs/data-access";
import { useAssistantDataAccess } from "./use-assistant-data-access";

function buildQueries(decks: Deck[], templates: Template[], cards: Card[]): Queries {
  return {
    getDecksQuery: () => ({ queryKey: queryKeys.decks.all(), queryFn: async () => decks }),
    getTemplatesQuery: () => ({ queryKey: queryKeys.templates.all(), queryFn: async () => templates }),
    getCardsQuery: (params: GetCardsParams) => ({
      queryKey: queryKeys.cards.deck(params),
      queryFn: async () => cards.filter((card) => card.deckId === params.deckId),
    }),
  } as unknown as Queries;
}

function makeWrapper(decks: Deck[], templates: Template[], cards: Card[]) {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries(decks, templates, cards));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  };
}

function makeWorld() {
  const template = createTemplate({ id: 1, title: "Default" });
  const spanish = createDeck({ id: 1, title: "Spanish", templateId: 1 });
  const kanji = createDeck({ id: 2, title: "Kanji", templateId: 1 });
  const cards = [
    createCard({ id: 1, deckId: 1, content: { "1": { text: "hola" }, "2": { text: "hello" } } }),
    createCard({ id: 2, deckId: 1, content: { "1": { text: "perro" }, "2": { text: "dog" } } }),
    createCard({ id: 3, deckId: 2, content: { "1": { text: "犬" }, "2": { text: "dog" } } }),
  ];
  return { template, decks: [spanish, kanji], cards };
}

function renderResolver(decks: Deck[], templates: Template[], cards: Card[]) {
  const { result } = renderHook(() => useAssistantDataAccess(), { wrapper: makeWrapper(decks, templates, cards) });
  return result.current.resolve;
}

async function resolveChat(decks: Deck[], templates: Template[], cards: Card[]): Promise<DataAccessSnapshot> {
  const resolve = renderResolver(decks, templates, cards);
  return await act(async () => resolve("chat", 1));
}

describe("useAssistantDataAccess — resolve", () => {
  it("chat resolve returns deck summaries only with a null write target", async () => {
    const world = makeWorld();
    const snapshot = await resolveChat(world.decks, [world.template], world.cards);

    expect(snapshot.context).toBe(
      [
        "User decks:",
        "- Deck: Spanish — 2 cards — Template: Default (Front, Back)",
        "- Deck: Kanji — 1 cards — Template: Default (Front, Back)",
      ].join("\n"),
    );
    expect(snapshot.manifest).toEqual({
      decks: [
        { deckId: 1, title: "Spanish", cardCount: 2, templateTitle: "Default" },
        { deckId: 2, title: "Kanji", cardCount: 1, templateTitle: "Default" },
      ],
      writeTarget: null,
    });
  });

  it("cards resolve appends the write-target deck's existing cards to the summaries", async () => {
    const world = makeWorld();
    const resolve = renderResolver(world.decks, [world.template], world.cards);

    const snapshot = await act(async () => resolve("cards", 1));

    expect(snapshot.context).toBe(
      [
        [
          "User decks:",
          "- Deck: Spanish — 2 cards — Template: Default (Front, Back)",
          "- Deck: Kanji — 1 cards — Template: Default (Front, Back)",
        ].join("\n"),
        [
          "Existing cards in deck Spanish (2 total):",
          "1. Front: hola | Back: hello",
          "2. Front: perro | Back: dog",
        ].join("\n"),
      ].join("\n\n"),
    );
    expect(snapshot.manifest.writeTarget).toEqual({
      isMissing: false,
      deckId: 1,
      title: "Spanish",
      totalCards: 2,
      listedCards: 2,
      fullFieldCards: 2,
      isCapped: false,
      isTruncated: false,
    });
  });

  it("cards resolve with a deleted write target records it missing and keeps the summaries", async () => {
    const world = makeWorld();
    const resolve = renderResolver(world.decks, [world.template], world.cards);

    const snapshot = await act(async () => resolve("cards", 999));

    expect(snapshot.manifest.writeTarget).toEqual({ isMissing: true });
    expect(snapshot.context).not.toContain("Existing cards");
    expect(snapshot.manifest.decks).toHaveLength(2);
  });

  it("a user with no decks resolves to an empty context and empty manifest", async () => {
    const snapshot = await resolveChat([], [], []);

    expect(snapshot.context).toBe("");
    expect(snapshot.manifest).toEqual({ decks: [], writeTarget: null });
  });
});
