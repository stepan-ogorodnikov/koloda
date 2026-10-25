import { SEED_TEMPLATE_TYPE_BACK_FIELD_ID, SEED_TEMPLATE_TYPE_FRONT_FIELD_ID } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { Card, Template } from "@koloda/srs";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { createCard, createDeck, createQueryClient, createTemplate, testId } from "../../test/test-helpers";
import { CardsTable } from "./cards-table";

i18n.loadAndActivate({ locale: "en", messages: {} });

type SetupOptions = { templates?: Template[]; deckTemplateId?: Template["id"] };

function setup(initialCards: Card[], { templates = [createTemplate()], deckTemplateId }: SetupOptions = {}) {
  let cards = initialCards;
  const deleteCards = vi.fn(async (_data: { ids: Card["id"][] }) => undefined);
  const deck = createDeck({ templateId: deckTemplateId ?? templates[0].id });
  const queries = {
    getCardsQuery: (params: { deckId: string }) => ({
      queryKey: queryKeys.cards.deck(params),
      queryFn: async () => cards,
    }),
    getDeckQuery: (id: string) => ({ queryKey: queryKeys.decks.detail(id), queryFn: async () => deck }),
    getTemplateQuery: (id: string) => ({
      queryKey: queryKeys.templates.detail(id),
      queryFn: async () => templates.find((template) => template.id === id) ?? null,
    }),
    getSettingsQuery: (name: "hotkeys") => ({ queryKey: queryKeys.settings.detail(name), queryFn: async () => null }),
    deleteCardMutation: () => ({ mutationFn: async () => undefined }),
    deleteCardsMutation: () => ({ mutationFn: deleteCards }),
  } as unknown as Queries;
  const store = createStore();
  store.set(queriesAtom, queries);
  const queryClient = createQueryClient();
  const controls = document.createElement("div");
  document.body.append(controls);

  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <CardsTable deckId={deck.id} controlsNode={controls} />
        </JotaiProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );

  const refetchCards = async (next: Card[]) => {
    cards = next;
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.cards.deck({ deckId: deck.id }) }));
  };

  return { controls, refetchCards, deleteCards };
}

function createCards(count: number) {
  return Array.from({ length: count }, (_, i) =>
    createCard({
      id: testId(100 + i),
      content: {
        [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: `card ${i + 1}` },
        [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: "answer" },
      },
      createdAt: new Date(2024, 0, 1, 0, i),
    }),
  );
}

function bodyRowTexts() {
  return [...document.querySelectorAll("tbody tr")].map((row) => row.textContent ?? "");
}

// Footer: "<start> - <end>", the records label, then the filtered count.
function footerRange() {
  const label = screen.getByText("table.pagination.records.label");
  const [start, , end] = [...(label.previousElementSibling?.children ?? [])].map((span) => span.textContent);
  return [start, end, label.nextElementSibling?.textContent];
}

async function goToLastPage() {
  fireEvent.click(await screen.findByRole("button", { name: "table.pagination.buttons.last" }));
}

describe("CardsTable pagination", () => {
  it("returns to the first page when a search narrows the rows", async () => {
    const { controls } = setup(createCards(40));
    await waitFor(() => expect(bodyRowTexts()).toHaveLength(15));
    await goToLastPage();
    await waitFor(() => expect(footerRange()).toEqual(["31", "40", "40"]));

    // "card 3" matches card 3 and cards 30-39.
    fireEvent.change(within(controls).getByRole("searchbox"), { target: { value: "card 3" } });

    await waitFor(() => expect(bodyRowTexts()).toHaveLength(11));
    expect(footerRange()).toEqual(["1", "11", "11"]);
  });

  it("moves to the new last page when a refetch drops the current one", async () => {
    const cards = createCards(40);
    const { refetchCards } = setup(cards);
    await waitFor(() => expect(bodyRowTexts()).toHaveLength(15));
    await goToLastPage();
    await waitFor(() => expect(footerRange()).toEqual(["31", "40", "40"]));

    await refetchCards(cards.slice(0, 20));

    await waitFor(() => expect(footerRange()).toEqual(["16", "20", "20"]));
    expect(bodyRowTexts()).toHaveLength(5);
    expect(bodyRowTexts()[0]).toContain("card 16");
  });
});
