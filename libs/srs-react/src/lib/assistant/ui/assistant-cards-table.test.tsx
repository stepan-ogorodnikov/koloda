import { queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { GeneratedCard } from "@koloda/ai";
import type { Template } from "@koloda/srs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AssistantCardsTable } from "./assistant-cards-table";
import { useAssistantCardsTable } from "./use-assistant-cards-table";
import { makeConversation, makeRun } from "../state/assistant-conversation.fixtures";
import { conversationsAtom, currentConversationIdAtom } from "../state/conversation-store";
import type { CardStatus } from "../state/conversation-reducer";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

const template = {
  id: 1,
  title: "T",
  content: {
    fields: [{ id: 1, name: "Front", type: "text" }],
    layout: [{ field: 1, operation: "display" as const }],
  },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  isLocked: false,
} as unknown as Template;

function makeCard(text: string): GeneratedCard {
  return { content: { "1": { text } } };
}

function buildQueries(): Queries {
  return {
    addCardsMutation: () => ({ mutationFn: async () => ({ insertedIds: [] }) }),
  } as unknown as Queries;
}

function Wrapper({ children }: { children: ReactNode }) {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={store}>{children}</JotaiProvider>
    </QueryClientProvider>
  );
}

function renderTable(cards: GeneratedCard[], cardStatuses: Record<number, CardStatus> = {}) {
  return render(
    <AssistantCardsTable
      runId="r1"
      cards={cards}
      cardStatuses={cardStatuses}
      template={template}
      deckId={1}
      templateId={1}
      canAdd={true}
      isGenerating={false}
    />,
    { wrapper: Wrapper },
  );
}

function selectionStates(): boolean[] {
  return screen
    .getAllByRole("checkbox")
    .slice(1) // skip the select-all header checkbox
    .map((box) => (box as HTMLInputElement).checked);
}

describe("AssistantCardsTable selection", () => {
  it("selects rows that arrive after mount (second propose_cards on the same run)", () => {
    const { rerender } = renderTable([makeCard("Front A")], { 0: "idle" });
    expect(selectionStates()).toEqual([true]);

    rerender(
      <AssistantCardsTable
        runId="r1"
        cards={[makeCard("Front A"), makeCard("Front B")]}
        cardStatuses={{ 0: "idle", 1: "idle" }}
        template={template}
        deckId={1}
        templateId={1}
        canAdd={true}
        isGenerating={false}
      />,
    );

    // INVARIANT: spec — "All rows are initially selected"; late-arriving rows
    // must be selected too, without dropping the user's existing selection.
    expect(selectionStates()).toEqual([true, true]);
  });

  it("clears the whole selection after a successful add so Add stays disabled", async () => {
    // Post-add state: statuses are no longer idle, so no row is selectable,
    // yet the rows still sit in the selection map. TanStack v9 deselect keeps
    // non-selectable rows, so the add callback must clear the whole map —
    // otherwise hasSelection stays true and a second Add re-adds duplicates.
    mountProbe([makeCard("Front A"), makeCard("Front B")], { 0: "success", 1: "success" });

    expect(screen.getByTestId("has-selection").textContent).toBe("true");
    fireEvent.click(screen.getByTestId("add"));

    await waitFor(() => expect(screen.getByTestId("has-selection").textContent).toBe("false"));
  });
});

function SelectionProbe() {
  const conversationId = useAtomValue(currentConversationIdAtom);
  const conversations = useAtomValue(conversationsAtom);
  const run = conversationId ? conversations[conversationId]?.runs.r1 : undefined;
  const { hasSelection, handleAddCards } = useAssistantCardsTable({
    runId: "r1",
    cards: run?.cards ?? [],
    cardStatuses: run?.cardStatuses ?? {},
    template,
    deckId: 1,
    templateId: 1,
  });

  return (
    <div>
      <button type="button" data-testid="add" onClick={handleAddCards}>
        add
      </button>
      <span data-testid="has-selection">{String(hasSelection)}</span>
    </div>
  );
}

function mountProbe(cards: GeneratedCard[], cardStatuses: Record<number, CardStatus>) {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
  const run = { ...makeRun("r1", "success"), cards, cardStatuses };
  store.set(currentConversationIdAtom, "c1");
  store.set(conversationsAtom, { c1: makeConversation("c1", { runs: { r1: run } }) });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
      <JotaiProvider store={store}>{children}</JotaiProvider>
    </QueryClientProvider>
  );

  render(<SelectionProbe />, { wrapper: Wrapper });
}
