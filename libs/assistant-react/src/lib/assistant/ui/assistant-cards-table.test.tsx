import { queriesAtom, queryKeys } from "@koloda/core-react";
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
import { testId } from "../../../test/test-helpers";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
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
} as unknown as Template;

function makeCard(text: string): GeneratedCard {
  return { content: { [testId(1)]: { text } } };
}

function buildQueries(): Queries {
  return {
    addCardsMutation: () => ({ mutationFn: async () => ({ insertedIds: [] }) }),
  } as unknown as Queries;
}

type WrapperProps = {
  children: ReactNode;
};

function Wrapper({ children }: WrapperProps) {
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

  it("does not select persisted non-idle cards, so Add stays disabled", () => {
    renderTable([makeCard("Front A"), makeCard("Front B")], { 0: "success", 1: "success" });

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect((screen.getByRole("button", { name: "assistant.add" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("selects only idle rows when restored with mixed statuses", () => {
    renderTable([makeCard("Front A"), makeCard("Front B")], { 0: "success", 1: "idle" });

    expect(selectionStates()).toEqual([true]);
    expect((screen.getByRole("button", { name: "assistant.add" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("replaces Add with the unavailable notice and drops selection when the template is gone", () => {
    render(
      <AssistantCardsTable
        runId="r1"
        cards={[makeCard("Front A")]}
        cardStatuses={{ 0: "idle" }}
        template={template}
        deckId={1}
        templateId={1}
        canAdd={true}
        isGenerating={false}
        isTemplateUnavailable
      />,
      { wrapper: Wrapper },
    );

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "assistant.add" })).toBeNull();
    expect(screen.getByText("assistant.template-unavailable")).toBeTruthy();
  });

  it("clears idle selection after a successful add so Add stays disabled", async () => {
    const mutate = vi.fn(async () => ({ insertedIds: [] }));
    mountProbe([makeCard("Front A"), makeCard("Front B")], { 0: "idle", 1: "idle" }, mutate);

    expect(screen.getByTestId("has-selection").textContent).toBe("true");
    fireEvent.click(screen.getByTestId("add"));

    await waitFor(() => expect(screen.getByTestId("has-selection").textContent).toBe("false"));
    expect(mutate).toHaveBeenCalledOnce();
  });

  it("refreshes deck cards and lessons after add, not AI settings", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const mutate = vi.fn(async () => ({ insertedIds: [] }));
    mountProbe([makeCard("Front A")], { 0: "idle" }, mutate, queryClient);

    fireEvent.click(screen.getByTestId("add"));
    await waitFor(() => expect(screen.getByTestId("has-selection").textContent).toBe("false"));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cards.deck({ deckId: testId(1) }) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.lessons.all() });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.settings.detail("ai") });
  });

  it("does not re-add persisted success cards when Add is invoked", async () => {
    const mutate = vi.fn(async () => ({ insertedIds: [] }));
    mountProbe([makeCard("Front A"), makeCard("Front B")], { 0: "success", 1: "success" }, mutate);

    expect(screen.getByTestId("has-selection").textContent).toBe("false");
    fireEvent.click(screen.getByTestId("add"));

    await waitFor(() => expect(mutate).not.toHaveBeenCalled());
  });

  it("settles add statuses on the originating conversation after switching away", async () => {
    let resolveMutate!: (value: { insertedIds: number[] }) => void;
    const mutate = vi.fn(
      () =>
        new Promise<{ insertedIds: number[] }>((resolve) => {
          resolveMutate = resolve;
        }),
    );

    const store = createStore();
    store.set(
      queriesAtom as unknown as Parameters<typeof store.set>[0],
      {
        addCardsMutation: () => ({ mutationFn: mutate }),
      } as unknown as Queries,
    );
    const cards = [makeCard("Front A")];
    store.set(currentConversationIdAtom, "A");
    store.set(conversationsAtom, {
      A: makeConversation("A", {
        runs: { r1: { ...makeRun("r1", "success"), cards, cardStatuses: { 0: "idle" } } },
      }),
      B: makeConversation("B"),
    });

    const Wrapper = ({ children }: WrapperProps) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );

    render(<SelectionProbe />, { wrapper: Wrapper });
    fireEvent.click(screen.getByTestId("add"));

    expect(store.get(conversationsAtom)["A"]?.runs["r1"]?.cardStatuses[0]).toBe("pending");
    await waitFor(() => expect(mutate).toHaveBeenCalledOnce());

    store.set(currentConversationIdAtom, "B");
    resolveMutate({ insertedIds: [1] });

    await waitFor(() => {
      expect(store.get(conversationsAtom)["A"]?.runs["r1"]?.cardStatuses[0]).toBe("success");
    });
    expect(store.get(conversationsAtom)["B"]?.runs["r1"]).toBeUndefined();
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
    deckId: testId(1),
    templateId: testId(1),
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

function mountProbe(
  cards: GeneratedCard[],
  cardStatuses: Record<number, CardStatus>,
  mutate: () => Promise<{ insertedIds: number[] }> = async () => ({ insertedIds: [] }),
  queryClient = new QueryClient(),
) {
  const store = createStore();
  store.set(
    queriesAtom as unknown as Parameters<typeof store.set>[0],
    {
      addCardsMutation: () => ({ mutationFn: mutate }),
    } as unknown as Queries,
  );
  const run = { ...makeRun("r1", "success"), cards, cardStatuses };
  store.set(currentConversationIdAtom, "c1");
  store.set(conversationsAtom, { c1: makeConversation("c1", { runs: { r1: run } }) });

  const Wrapper = ({ children }: WrapperProps) => (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={store}>{children}</JotaiProvider>
    </QueryClientProvider>
  );

  render(<SelectionProbe />, { wrapper: Wrapper });
}
