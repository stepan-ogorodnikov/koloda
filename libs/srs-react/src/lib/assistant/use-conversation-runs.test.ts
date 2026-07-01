import type { ChatStreamRequest, StreamUsage } from "@koloda/ai";
import type { StreamResult } from "@koloda/ai-react";
import { act, renderHook } from "@testing-library/react";
import { createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import {
  assistantConversationStateAtom,
  conversationsAtom,
  dispatchToConversationOnStore,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "./assistant-conversation-atoms";
import type { ConversationAction, ConversationState } from "./conversation-state";
import { initialConversationState } from "./conversation-state";
import type { CardGenerationStreamRequest } from "./use-assistant-card-generation";
import { useConversationRuns } from "./use-conversation-runs";

type Dispatch = (action: ConversationAction) => void;
type DispatchFor = (id: string, action: ConversationAction) => void;
type GetState = () => ConversationState;

function makeConversation(id: string, overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    ...initialConversationState,
    id,
    createdAt: new Date(1),
    ...overrides,
  };
}

function createHarness() {
  const store = createStore();
  const dispatchToMap: Array<{ id: string; action: ConversationAction }> = [];
  const dispatchToCurrent: Array<ConversationAction> = [];

  const dispatch: Dispatch = (action) => {
    dispatchToCurrent.push(action);
    store.set(assistantConversationStateAtom, action);
  };

  const dispatchFor: DispatchFor = (id, action) => {
    dispatchToMap.push({ id, action });
    dispatchToConversationOnStore(store, id, action);
  };

  const getState: GetState = () => store.get(assistantConversationStateAtom);

  return { store, dispatch, dispatchFor, getState, dispatchToMap, dispatchToCurrent };
}

describe("useConversationRuns", () => {
  it("executeChatRun dispatches updateAssistantText via dispatchFor (per-id) so background streams land on the originating conversation", async () => {
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(upsertConversationAtom, makeConversation("B"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, {
      type: "startRun",
      runId: "run-1",
      mode: "chat",
      request: {},
    });
    harness.store.set(assistantConversationStateAtom, {
      type: "addAssistantMessage",
      runId: "run-1",
      kind: "chat-text",
      text: "",
    });

    // Start a chat run on A, then switch the current view to B mid-stream.
    let streamStarted = false;
    let resolveStream!: (result: { streamResult: StreamResult; usage: StreamUsage | null }) => void;
    const streamChat = vi.fn(async (
      _request: ChatStreamRequest,
      onChunk: (chunk: string) => void,
    ) => {
      streamStarted = true;
      onChunk("Hello ");
      onChunk("world");
      // The user switches to B before the stream resolves.
      harness.store.set(setCurrentConversationIdAtom, "B");
      return new Promise<{ streamResult: StreamResult; usage: StreamUsage | null }>((resolve) => {
        resolveStream = resolve;
      });
    });

    const onChatStreamComplete = vi.fn();
    const { result } = renderHook(() =>
      useConversationRuns(
        streamChat as never,
        vi.fn() as never,
        harness.dispatch,
        harness.dispatchFor,
        harness.getState,
        onChatStreamComplete,
      )
    );

    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.executeChatRun("A", "run-1", {} as ChatStreamRequest);
    });

    // Wait for the streamChat mock to begin.
    await act(async () => {
      while (!streamStarted) await Promise.resolve();
    });

    // Resolve the stream and finish.
    await act(async () => {
      resolveStream({ streamResult: "success", usage: null });
      await runPromise;
    });

    // Every updateAssistantText action went through dispatchFor (per-id),
    // not dispatch (current), so B is unaffected.
    const updateActions = harness.dispatchToMap
      .filter((entry) => entry.action.type === "updateAssistantText")
      .map((entry) => entry);
    expect(updateActions.length).toBeGreaterThan(0);
    for (const entry of updateActions) {
      expect(entry.id).toBe("A");
    }

    // completeRun also went through dispatchFor with id "A".
    const completeActions = harness.dispatchToMap.filter((entry) => entry.action.type === "completeRun");
    expect(completeActions).toHaveLength(1);
    expect(completeActions[0].id).toBe("A");

    // A's assistant message ends with the full text.
    const stateA = harness.store.get(conversationsAtom)["A"];
    expect(stateA.messages.at(-1)?.parts[0]).toEqual({ type: "text", text: "Hello world" });

    // B is untouched.
    const stateB = harness.store.get(conversationsAtom)["B"];
    expect(stateB.messages).toHaveLength(0);
    expect(stateB.activeRunId).toBeNull();

    // The completion callback was called with the run's runId.
    expect(onChatStreamComplete).toHaveBeenCalledWith("run-1");
  });

  it("executeGenerateRun dispatches addCard via dispatchFor (per-id)", async () => {
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(upsertConversationAtom, makeConversation("B"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, {
      type: "startRun",
      runId: "run-A",
      mode: "cards",
      request: {},
    });
    harness.store.set(assistantConversationStateAtom, {
      type: "addAssistantMessage",
      runId: "run-A",
      kind: "generated-cards",
      text: "",
    });

    // Switch the current view to B before the generator runs.
    harness.store.set(setCurrentConversationIdAtom, "B");

    const generate = vi.fn(async (
      _request: CardGenerationStreamRequest,
      onCard: (card: { content: Record<string, { text: string }> }) => void,
    ) => {
      onCard({ content: { front: { text: "Q1" }, back: { text: "A1" } } });
      onCard({ content: { front: { text: "Q2" }, back: { text: "A2" } } });
      return "success" as StreamResult;
    });

    const onCardStreamComplete = vi.fn();
    const { result } = renderHook(() =>
      useConversationRuns(
        vi.fn() as never,
        generate as never,
        harness.dispatch,
        harness.dispatchFor,
        harness.getState,
        undefined,
        onCardStreamComplete,
      )
    );

    await act(async () => {
      await result.current.executeGenerateRun("A", "run-A", {} as CardGenerationStreamRequest);
    });

    // addCard went to A, not B.
    const addCardActions = harness.dispatchToMap.filter((entry) => entry.action.type === "addCard");
    expect(addCardActions.length).toBe(2);
    for (const entry of addCardActions) {
      expect(entry.id).toBe("A");
    }

    // B is still empty.
    const stateB = harness.store.get(conversationsAtom)["B"];
    expect(stateB.messages).toHaveLength(0);

    // The completion callback was called with the run's runId.
    expect(onCardStreamComplete).toHaveBeenCalledWith("run-A");
  });

  it("an aborted chat stream dispatches cancelRun to the originating conversation", async () => {
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(upsertConversationAtom, makeConversation("B"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, {
      type: "startRun",
      runId: "run-A",
      mode: "chat",
      request: {},
    });
    harness.store.set(assistantConversationStateAtom, {
      type: "addAssistantMessage",
      runId: "run-A",
      kind: "chat-text",
      text: "",
    });
    harness.store.set(setCurrentConversationIdAtom, "B");

    const streamChat = vi.fn(async (
      _request: ChatStreamRequest,
      onChunk: (chunk: string) => void,
    ) => {
      onChunk("partial");
      return { streamResult: "aborted" as StreamResult, usage: null };
    });

    const { result } = renderHook(() =>
      useConversationRuns(
        streamChat as never,
        vi.fn() as never,
        harness.dispatch,
        harness.dispatchFor,
        harness.getState,
      )
    );

    await act(async () => {
      await result.current.executeChatRun("A", "run-A", {} as ChatStreamRequest);
    });

    // cancelRun landed on A, not B.
    const cancelActions = harness.dispatchToMap.filter((entry) => entry.action.type === "cancelRun");
    expect(cancelActions).toHaveLength(1);
    expect(cancelActions[0].id).toBe("A");
  });
});
