import { SEED_TEMPLATE_TYPE_BACK_FIELD_ID, SEED_TEMPLATE_TYPE_FRONT_FIELD_ID } from "@koloda/app";
import { langAtom, queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { Card } from "@koloda/srs";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { createCard, createDeck, createQueryClient, createTemplate, testId } from "../../test/test-helpers";
import { CardsStack } from "./cards-stack";

// WHY: NumberFlow renders its digits inside a custom element that jsdom leaves empty.
vi.mock("@number-flow/react", () => ({
  default: ({ value }: { value: number }) => <span>{value}</span>,
  NumberFlowGroup: ({ children }: PropsWithChildren) => <>{children}</>,
}));

// WHY: the form timestamps use the `Trans` macro, which the test config does not compile.
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: PropsWithChildren) => <>{children}</> }));

i18n.loadAndActivate({ locale: "en", messages: {} });

function setup(initialCards: Card[]) {
  let cards = initialCards;
  const template = createTemplate();
  const deck = createDeck({ templateId: template.id });
  const queries = {
    getCardsQuery: (params: { deckId: string }) => ({
      queryKey: queryKeys.cards.deck(params),
      queryFn: async () => cards,
    }),
    getTemplateQuery: (id: string) => ({ queryKey: queryKeys.templates.detail(id), queryFn: async () => template }),
    getSettingsQuery: (name: "hotkeys") => ({ queryKey: queryKeys.settings.detail(name), queryFn: async () => null }),
    updateCardMutation: () => ({ mutationFn: async () => undefined }),
    resetCardProgressMutation: () => ({ mutationFn: async () => undefined }),
    deleteCardMutation: () => ({ mutationFn: async () => undefined }),
    addAttachmentMutation: () => ({ mutationFn: async () => null }),
  } as unknown as Queries;
  const store = createStore();
  store.set(queriesAtom, queries);
  store.set(langAtom, "en");
  const queryClient = createQueryClient();
  const controls = document.createElement("div");
  document.body.append(controls);

  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <CardsStack deckId={deck.id} controlsNode={controls} />
        </JotaiProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );

  const refetchCards = async (next: Card[]) => {
    cards = next;
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.cards.deck({ deckId: deck.id }) }));
  };

  return { controls, refetchCards };
}

function createCards(count: number) {
  return Array.from({ length: count }, (_, i) =>
    createCard({
      id: testId(100 + i),
      content: {
        [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: `card ${i + 1}` },
        [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: "answer" },
      },
    }),
  );
}

describe("CardsStack", () => {
  it("shows the last remaining card when the list shrinks below the current one", async () => {
    const cards = createCards(3);
    const { controls, refetchCards } = setup(cards);
    const next = within(controls).getByRole("button", { name: "cards-stack.navigation.next" });
    await waitFor(() => expect(next).toHaveProperty("disabled", false));
    fireEvent.click(next);
    fireEvent.click(next);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Front" })).toHaveProperty("value", "card 3"));

    // The third card is deleted.
    await refetchCards(cards.slice(0, 2));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Front" })).toHaveProperty("value", "card 2"));
    expect(controls.textContent).toBe("2/2");
    expect(next).toHaveProperty("disabled", true);
  });
});
