import type { AIRuntime, ChatStreamRequest } from "@koloda/ai";
import { aiRuntimeAtom, queryKeys } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialConversationState } from "../state/conversation-reducer";
import type { ConversationReducerState } from "../state/conversation-reducer";
import { dispatchToConversationOnStore, upsertConversationAtom } from "../state/conversation-store";
import { resetAssistantEngineForTests } from "./assistant-persistence-host";
import { getAssistantEngine } from "./assistant-engine-instance";
import { useAssistantEngineHost } from "./use-assistant-engine-host";

function makeConversation(id: string): ConversationReducerState {
  return { ...initialConversationState, id, createdAt: new Date(1) };
}

function createRuntime(chat: AIRuntime["chat"]): AIRuntime {
  return { listModels: async () => [], chat };
}

describe("add_deck query invalidation", () => {
  beforeEach(() => {
    resetAssistantEngineForTests();
  });

  afterEach(() => {
    resetAssistantEngineForTests();
  });

  function mount(chat: AIRuntime["chat"]) {
    const store = createStore();
    store.set(aiRuntimeAtom, createRuntime(chat));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const view = renderHook(() => useAssistantEngineHost(), {
      wrapper: function Wrapper({ children }: PropsWithChildren) {
        return (
          <QueryClientProvider client={queryClient}>
            <JotaiProvider store={store}>{children}</JotaiProvider>
          </QueryClientProvider>
        );
      },
    });

    return { store, invalidate, unmount: view.unmount };
  }

  async function runChat(store: ReturnType<typeof createStore>, seedRun: boolean) {
    if (seedRun) {
      store.set(upsertConversationAtom, makeConversation("conv-1"));
      dispatchToConversationOnStore(store, "conv-1", [
        "submitTurn",
        { runId: "run-1", text: "make a deck", kind: "chat-text", assistantText: "" },
      ]);
    }
    await getAssistantEngine().dispatch({
      type: "submit",
      conversationId: "conv-1",
      input: {
        kind: "chat",
        runId: "run-1",
        request: { messages: [], input: { modelId: "m", prompt: "hi" }, tools: ["add_deck", "list_decks"] },
        execution: { profileId: "profile-1" },
      },
    });
  }

  it("invalidates deck caches only after a recorded add_deck success", async () => {
    const { store, invalidate, unmount } = mount(async (_profileId, request: ChatStreamRequest) => {
      const onToolEvent = request.onToolEvent;
      if (!onToolEvent) throw new Error("expected onToolEvent");
      onToolEvent({ kind: "toolCall", call: { id: "list-1", name: "list_decks", input: {} } });
      onToolEvent({ kind: "toolResult", callId: "list-1", output: { decks: [] } });
      onToolEvent({ kind: "toolCall", call: { id: "add-err", name: "add_deck", input: { title: "Nope" } } });
      onToolEvent({ kind: "toolResult", callId: "add-err", error: "Template not found" });
      onToolEvent({ kind: "toolCall", call: { id: "add-ok", name: "add_deck", input: { title: "Spanish" } } });
      onToolEvent({
        kind: "toolResult",
        callId: "add-ok",
        output: { deckId: "deck-1", title: "Spanish" },
      });
    });

    await runChat(store, true);

    expect(invalidate.mock.calls.map((call) => call[0])).toEqual([
      { queryKey: queryKeys.decks.all() },
      { queryKey: queryKeys.lessons.all({}) },
      { queryKey: queryKeys.algorithms.decksAll() },
      { queryKey: queryKeys.templates.decksAll() },
    ]);
    unmount();
  });

  it("does not invalidate when the tool result never lands on a run", async () => {
    const { store, invalidate, unmount } = mount(async (_profileId, request: ChatStreamRequest) => {
      const onToolEvent = request.onToolEvent;
      if (!onToolEvent) throw new Error("expected onToolEvent");
      onToolEvent({ kind: "toolCall", call: { id: "add-ok", name: "add_deck", input: { title: "Spanish" } } });
      onToolEvent({
        kind: "toolResult",
        callId: "add-ok",
        output: { deckId: "deck-1", title: "Spanish" },
      });
    });

    await runChat(store, false);

    expect(invalidate).not.toHaveBeenCalled();
    unmount();
  });
});
