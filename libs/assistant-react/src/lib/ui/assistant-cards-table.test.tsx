import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { GeneratedCard } from "@koloda/ai";
import type { InsertCardsResponse, TemplateFields } from "@koloda/srs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAtomValue, createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AssistantCardsTable } from "./assistant-cards-table";
import { useAssistantCardsTable } from "./use-assistant-cards-table";
import { makeConversation, makeRun } from "../state/assistant-conversation.fixtures";
import {
  conversationsAtom,
  currentConversationIdAtom,
  dispatchToConversationOnStore,
} from "../state/conversation-store";
import type { CardStatus, ConversationReducerState } from "../state/conversation-types";
import { testId } from "../../test/test-helpers";

const templateFields: TemplateFields = [{ id: testId(1), title: "Front", type: "text", isRequired: true }];

function makeCard(text: string): GeneratedCard {
  return { content: { [testId(1)]: { text } } };
}

type AddCards = (cards: unknown[]) => Promise<InsertCardsResponse>;

const addAll: AddCards = async (cards) => cards.map(() => ({}));

function buildQueries(): Queries {
  return {
    addCardsMutation: () => ({ mutationFn: addAll }),
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
      templateFields={templateFields}
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
        templateFields={templateFields}
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

  it.each([
    ["template", "assistant.template-unavailable"],
    ["deck", "assistant.deck-unavailable"],
  ] as const)("replaces Add with the unavailable notice and drops selection when the %s is gone", (target, notice) => {
    render(
      <AssistantCardsTable
        runId="r1"
        cards={[makeCard("Front A")]}
        cardStatuses={{ 0: "idle" }}
        templateFields={templateFields}
        deckId={1}
        templateId={1}
        canAdd={true}
        isGenerating={false}
        unavailableTarget={target}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "assistant.add" })).toBeNull();
    expect(screen.getByText(notice)).toBeTruthy();
  });

  it("clears idle selection after a successful add so Add stays disabled", async () => {
    const mutate = vi.fn(addAll);
    mountProbe([makeCard("Front A"), makeCard("Front B")], { 0: "idle", 1: "idle" }, mutate);

    expect(screen.getByTestId("has-selection").textContent).toBe("true");
    fireEvent.click(screen.getByTestId("add"));

    await waitFor(() => expect(screen.getByTestId("has-selection").textContent).toBe("false"));
    expect(mutate).toHaveBeenCalledOnce();
  });

  it("refreshes deck cards and lessons after add, not AI settings", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const mutate = vi.fn(addAll);
    mountProbe([makeCard("Front A")], { 0: "idle" }, mutate, queryClient);

    fireEvent.click(screen.getByTestId("add"));
    await waitFor(() => expect(screen.getByTestId("has-selection").textContent).toBe("false"));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cards.deck({ deckId: testId(1) }) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.lessons.all() });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.settings.detail("ai") });
  });

  it("does not re-add persisted success cards when Add is invoked", async () => {
    const mutate = vi.fn(addAll);
    mountProbe([makeCard("Front A"), makeCard("Front B")], { 0: "success", 1: "success" }, mutate);

    expect(screen.getByTestId("has-selection").textContent).toBe("false");
    fireEvent.click(screen.getByTestId("add"));

    await waitFor(() => expect(mutate).not.toHaveBeenCalled());
  });

  it("maps each per-card host result to its row, in input order", async () => {
    const mutate = vi.fn<AddCards>(async () => [{}, { error: { code: "not-found.cards.add.deck" } }]);
    const store = mountProbe([makeCard("Front A"), makeCard("Front B")], { 0: "idle", 1: "idle" }, mutate);

    fireEvent.click(screen.getByTestId("add"));

    await waitFor(() => {
      expect(store.get(conversationsAtom)["c1"]?.runs["r1"]?.cardStatuses).toEqual({ 0: "success", 1: "error" });
    });
  });

  it("marks only the sent cards error when the add request rejects", async () => {
    const mutate = vi.fn<AddCards>(async () => {
      throw new Error("host unreachable");
    });
    const store = mountProbe(
      [makeCard("Front A"), makeCard("Front B"), makeCard("Front C")],
      { 0: "idle", 1: "idle", 2: "success" },
      mutate,
      new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
    );

    fireEvent.click(screen.getByTestId("add"));

    await waitFor(() => {
      expect(store.get(conversationsAtom)["c1"]?.runs["r1"]?.cardStatuses).toEqual({
        0: "error",
        1: "error",
        2: "success",
      });
    });
    expect(mutate).toHaveBeenCalledOnce();
  });

  it("settles Add on the originating conversation after the table unmounts", async () => {
    const add = gatedAdd();
    const store = conversationsStore(add.mutate, {
      A: makeConversation("A", {
        runs: { r1: { ...makeRun("r1", "success"), cards: [makeCard("Front A")], cardStatuses: { 0: "idle" } } },
      }),
      B: makeConversation("B"),
    });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { unmount } = renderProbeOn(store, queryClient);

    fireEvent.click(screen.getByTestId("add"));
    expect(store.get(conversationsAtom)["A"]?.runs["r1"]?.cardStatuses[0]).toBe("pending");
    await waitFor(() => expect(add.mutate).toHaveBeenCalledOnce());

    // Switch away, which unmounts the table, then let the host answer.
    store.set(currentConversationIdAtom, "B");
    unmount();
    add.resolve([{}]);

    await waitFor(() => {
      expect(store.get(conversationsAtom)["A"]?.runs["r1"]?.cardStatuses[0]).toBe("success");
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cards.deck({ deckId: testId(1) }) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.lessons.all() });
    expect(store.get(conversationsAtom)["B"]?.runs["r1"]).toBeUndefined();
  });

  it("drops a late Add result once a retry has cleared the run's cards", async () => {
    const add = gatedAdd();
    const store = conversationsStore(add.mutate, {
      A: makeConversation("A", {
        runs: {
          r1: {
            ...makeRun("r1", "canceled"),
            reason: "user",
            cards: [makeCard("Front A")],
            cardStatuses: { 0: "idle" },
          },
        },
      }),
    });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    renderProbeOn(store, queryClient);

    fireEvent.click(screen.getByTestId("add"));
    await waitFor(() => expect(add.mutate).toHaveBeenCalledOnce());

    // Retry reuses the run id and clears its cards before the host answers.
    dispatchToConversationOnStore(store, "A", ["restartRun", { runId: "r1" }]);
    add.resolve([{}]);

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(store.get(conversationsAtom)["A"]?.runs["r1"]?.cardStatuses).toEqual({});
  });
});

function gatedAdd() {
  let resolve!: (value: InsertCardsResponse) => void;
  const mutate = vi.fn<AddCards>(
    () =>
      new Promise<InsertCardsResponse>((settle) => {
        resolve = settle;
      }),
  );
  return { mutate, resolve: (value: InsertCardsResponse) => resolve(value) };
}

function conversationsStore(mutate: AddCards, conversations: Record<string, ConversationReducerState>) {
  const store = createStore();
  store.set(
    queriesAtom as unknown as Parameters<typeof store.set>[0],
    {
      addCardsMutation: () => ({ mutationFn: mutate }),
    } as unknown as Queries,
  );
  store.set(currentConversationIdAtom, Object.keys(conversations)[0] ?? null);
  store.set(conversationsAtom, conversations);
  return store;
}

function renderProbeOn(store: ReturnType<typeof createStore>, queryClient: QueryClient) {
  const Wrapper = ({ children }: WrapperProps) => (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={store}>{children}</JotaiProvider>
    </QueryClientProvider>
  );
  return render(<SelectionProbe />, { wrapper: Wrapper });
}

function SelectionProbe() {
  const conversationId = useAtomValue(currentConversationIdAtom);
  const conversations = useAtomValue(conversationsAtom);
  const run = conversationId ? conversations[conversationId]?.runs.r1 : undefined;
  const { hasSelection, handleAddCards } = useAssistantCardsTable({
    runId: "r1",
    cards: run?.cards ?? [],
    cardStatuses: run?.cardStatuses ?? {},
    templateFields,
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
  mutate: AddCards = addAll,
  queryClient = new QueryClient(),
) {
  const run = { ...makeRun("r1", "success"), cards, cardStatuses };
  const store = conversationsStore(mutate, { c1: makeConversation("c1", { runs: { r1: run } }) });
  renderProbeOn(store, queryClient);
  return store;
}
