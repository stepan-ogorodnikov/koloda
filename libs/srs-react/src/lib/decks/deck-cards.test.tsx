import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { createDeck, createQueryClient } from "../../test/test-helpers";
import { cardsViewAtom } from "../cards/cards-view-toggle";
import { DeckCards } from "./deck-cards";

// The views and the add dialog do not take part in choosing which view shows.
vi.mock("../cards/cards-stack", () => ({ CardsStack: () => <p>stack view</p> }));
vi.mock("../cards/cards-table", () => ({ CardsTable: () => <p>table view</p> }));
vi.mock("../cards/add-card", () => ({ AddCard: () => null }));

i18n.loadAndActivate({ locale: "en", messages: {} });

function stubMatchMedia() {
  let isNarrow = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    get matches() {
      return isNarrow;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));

  return (value: boolean) =>
    act(() => {
      isNarrow = value;
      listeners.forEach((listener) => listener());
    });
}

describe("DeckCards", () => {
  it("forces the stack on narrow screens and restores the chosen view when widened", async () => {
    const setNarrow = stubMatchMedia();
    const deck = createDeck();
    const store = createStore();
    store.set(queriesAtom, {
      getDeckQuery: (id: string) => ({ queryKey: queryKeys.decks.detail(id), queryFn: async () => deck }),
      getCardsQuery: (params: { deckId: string }) => ({
        queryKey: queryKeys.cards.deck(params),
        queryFn: async () => [],
      }),
    } as unknown as Queries);
    store.set(cardsViewAtom, "table");

    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={createQueryClient()}>
          <JotaiProvider store={store}>
            <DeckCards deckId={deck.id} />
          </JotaiProvider>
        </QueryClientProvider>
      </I18nProvider>,
    );
    expect(await screen.findByText("table view")).toBeTruthy();

    await setNarrow(true);
    expect(await screen.findByText("stack view")).toBeTruthy();

    await setNarrow(false);
    expect(await screen.findByText("table view")).toBeTruthy();
    expect(store.get(cardsViewAtom)).toBe("table");
  });
});
