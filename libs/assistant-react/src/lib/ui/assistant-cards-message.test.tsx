import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { Deck, Template } from "@koloda/srs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { AssistantCardsMessage } from "./assistant-cards-message";
import { testId } from "../../test/test-helpers";

vi.mock("./assistant-cards-table", () => ({
  AssistantCardsTable: ({ cards, unavailableTarget }: { cards: unknown[]; unavailableTarget?: string }) => (
    <div data-testid="cards-table" data-unavailable={unavailableTarget ?? "none"}>
      {cards.length} cards
    </div>
  ),
}));

const template = {
  id: testId(1),
  title: "T",
  content: {
    fields: [{ id: testId(1), title: "Front", type: "text", isRequired: true }],
    layout: [{ field: testId(1), operation: "display" as const }],
  },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  isLocked: false,
} as Template;

const baseProps = {
  runId: "r1",
  cards: [{ content: { [testId(1)]: { text: "Front A" } } }],
  cardStatuses: { 0: "idle" as const },
  templateFields: template.content.fields,
  deckId: testId(1),
  templateId: testId(1),
  canAdd: false,
  isGenerating: false,
};

const deck = { id: testId(1), title: "D" } as Deck;

type LiveTargets = {
  deck?: Deck | null;
  template?: Template | null;
};

function buildQueries({ deck: liveDeck = deck, template: liveTemplate = template }: LiveTargets): Queries {
  return {
    getDeckQuery: (id: Deck["id"]) => ({
      queryKey: queryKeys.decks.detail(id),
      queryFn: async () => (id === deck.id ? liveDeck : null),
    }),
    getTemplateQuery: (id: Template["id"]) => ({
      queryKey: queryKeys.templates.detail(id),
      queryFn: async () => (id === template.id ? liveTemplate : null),
    }),
  } as unknown as Queries;
}

function renderMessage(
  props: Partial<React.ComponentProps<typeof AssistantCardsMessage>> = {},
  live: LiveTargets = {},
) {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries(live));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={store}>{children}</JotaiProvider>
    </QueryClientProvider>
  );
  render(<AssistantCardsMessage {...baseProps} {...props} />, { wrapper });
  return queryClient;
}

describe("AssistantCardsMessage", () => {
  it.each([
    ["template", { template: null }],
    ["deck", { deck: null }],
    // WHY: deck first, the order the hosts report add errors in.
    ["deck", { deck: null, template: null }],
  ] as const)("keeps the snapshot table and marks the %s unavailable when it is gone", async (target, live) => {
    renderMessage({}, live);

    await waitFor(() => {
      expect(screen.getByTestId("cards-table").getAttribute("data-unavailable")).toBe(target);
    });
    expect(screen.getByTestId("cards-table").textContent).toContain("1 cards");
  });

  it("does not mark unavailable when both write targets still exist", async () => {
    const queryClient = renderMessage();

    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(screen.getByTestId("cards-table").getAttribute("data-unavailable")).toBe("none");
  });

  it.each([
    ["template", { templateId: undefined }, { template: null }],
    ["deck", { deckId: null }, { deck: null }],
  ] as const)("does not mark unavailable when the run has no write-target %s id", async (_target, props, live) => {
    const queryClient = renderMessage(props, live);

    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(screen.getByTestId("cards-table").getAttribute("data-unavailable")).toBe("none");
  });
});
