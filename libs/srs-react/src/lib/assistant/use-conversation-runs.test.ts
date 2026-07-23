import type { ChatStreamGenerator, ChatStreamRequest, StreamUsage } from "@koloda/ai";
import type * as KolodaAiReactModule from "@koloda/ai-react";
import type { CardGenerationExecutor, CardGenerationStreamRequest, StreamResult } from "@koloda/ai-react";
import { act, renderHook } from "@testing-library/react";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assistantConversationStateAtom,
  conversationsAtom,
  dispatchToConversationOnStore,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "./conversation-store";
import type { ConversationReducerAction, ConversationReducerState } from "./conversation-reducer";
import { initialConversationState } from "./conversation-reducer";
import { useConversationRuns } from "./use-conversation-runs";

type Dispatch = (action: ConversationReducerAction) => void;
type DispatchToConversation = (id: string, action: ConversationReducerAction) => void;
type GetState = () => ConversationReducerState;

const wire = vi.hoisted(() => ({
  streamChat: null as
    | null
    | ((
        request: ChatStreamRequest,
        onChunk: (chunk: string) => void,
      ) => Promise<{ streamResult: StreamResult; usage: StreamUsage | null }>),
  generate: null as
    | null
    | ((
        request: CardGenerationStreamRequest,
        onCard?: (card: { content: Record<string, { text: string }> }) => void,
      ) => Promise<StreamResult>),
  cancelChat: vi.fn(),
  cancelGenerate: vi.fn(),
}));

vi.mock("@koloda/ai-react", async () => {
  const actual = await vi.importActual<typeof KolodaAiReactModule>("@koloda/ai-react");
  return {
    ...actual,
    useChatStream: () => ({
      text: "",
      isStreaming: false,
      error: null,
      usage: null,
      stream: (request: ChatStreamRequest, onChunk: (chunk: string) => void) => {
        if (!wire.streamChat) throw new Error("streamChat mock not set");
        return wire.streamChat(request, onChunk);
      },
      cancel: wire.cancelChat,
      reset: vi.fn(),
    }),
    useAssistantCardGeneration: () => ({
      cards: [],
      isGenerating: false,
      error: null,
      generate: (
        request: CardGenerationStreamRequest,
        onCard?: (card: { content: Record<string, { text: string }> }) => void,
      ) => {
        if (!wire.generate) throw new Error("generate mock not set");
        return wire.generate(request, onCard);
      },
      clearCards: vi.fn(),
      cancel: wire.cancelGenerate,
    }),
  };
});

function makeConversation(id: string, overrides: Partial<ConversationReducerState> = {}): ConversationReducerState {
  return {
    ...initialConversationState,
    id,
    createdAt: new Date(1),
    ...overrides,
  };
}

function createHarness() {
  const store = createStore();
  const dispatchToMap: Array<{ id: string; action: ConversationReducerAction }> = [];
  const dispatchToCurrent: Array<ConversationReducerAction> = [];

  const dispatchPersisted: Dispatch = (action) => {
    dispatchToCurrent.push(action);
    store.set(assistantConversationStateAtom, action);
  };

  const dispatchToConversation: DispatchToConversation = (id, action) => {
    dispatchToMap.push({ id, action });
    dispatchToConversationOnStore(store, id, action);
  };

  const getState: GetState = () => store.get(assistantConversationStateAtom);
  const bumpPendingSave = vi.fn();

  return {
    store,
    dispatchPersisted,
    dispatchToConversation,
    getState,
    bumpPendingSave,
    dispatchToMap,
    dispatchToCurrent,
  };
}

function renderRuns(harness: ReturnType<typeof createHarness>) {
  return renderHook(() =>
    useConversationRuns({
      streamGenerator: vi.fn() as CardGenerationExecutor,
      chatStreamGenerator: vi.fn() as ChatStreamGenerator,
      dispatchPersisted: harness.dispatchPersisted,
      dispatchToConversation: harness.dispatchToConversation,
      readState: harness.getState,
      bumpPendingSave: harness.bumpPendingSave,
    }),
  );
}

describe("useConversationRuns", () => {
  beforeEach(() => {
    wire.streamChat = null;
    wire.generate = null;
    wire.cancelChat.mockClear();
    wire.cancelGenerate.mockClear();
  });

  it("executeChatRun dispatches updateAssistantText via dispatchToConversation (per-id) so background streams land on the originating conversation", async () => {
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(upsertConversationAtom, makeConversation("B"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "run-1",
        mode: "chat",
        request: {},
      },
    ]);
    harness.store.set(assistantConversationStateAtom, [
      "addAssistantMessage",
      {
        runId: "run-1",
        kind: "chat-text",
        text: "",
      },
    ]);

    let streamStarted = false;
    let resolveStream!: (result: { streamResult: StreamResult; usage: StreamUsage | null }) => void;
    wire.streamChat = vi.fn(async (_request: ChatStreamRequest, onChunk: (chunk: string) => void) => {
      streamStarted = true;
      onChunk("Hello ");
      onChunk("world");
      harness.store.set(setCurrentConversationIdAtom, "B");
      return new Promise<{ streamResult: StreamResult; usage: StreamUsage | null }>((resolve) => {
        resolveStream = resolve;
      });
    });

    const { result } = renderRuns(harness);

    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.executeChatRun("A", "run-1", {} as ChatStreamRequest);
    });

    await act(async () => {
      while (!streamStarted) await Promise.resolve();
    });

    await act(async () => {
      resolveStream({ streamResult: "success", usage: null });
      await runPromise;
    });

    const updateActions = harness.dispatchToMap
      .filter((entry) => entry.action[0] === "updateAssistantText")
      .map((entry) => entry);
    expect(updateActions.length).toBeGreaterThan(0);
    for (const entry of updateActions) {
      expect(entry.id).toBe("A");
    }

    const completeActions = harness.dispatchToMap.filter((entry) => entry.action[0] === "completeRun");
    expect(completeActions).toHaveLength(1);
    expect(completeActions[0].id).toBe("A");

    const stateA = harness.store.get(conversationsAtom)["A"];
    expect(stateA.messages.at(-1)?.parts[0]).toEqual({ type: "text", text: "Hello world" });

    const stateB = harness.store.get(conversationsAtom)["B"];
    expect(stateB.messages).toHaveLength(0);
    expect(stateB.activeRunId).toBeNull();

    expect(harness.bumpPendingSave).toHaveBeenCalled();
  });

  it("executeGenerateRun dispatches addCard via dispatchToConversation (per-id)", async () => {
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(upsertConversationAtom, makeConversation("B"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "run-A",
        mode: "cards",
        request: {},
      },
    ]);
    harness.store.set(assistantConversationStateAtom, [
      "addAssistantMessage",
      {
        runId: "run-A",
        kind: "generated-cards",
        text: "",
      },
    ]);

    harness.store.set(setCurrentConversationIdAtom, "B");

    wire.generate = vi.fn(
      async (
        _request: CardGenerationStreamRequest,
        onCard: (card: { content: Record<string, { text: string }> }) => void = () => undefined,
      ) => {
        onCard({ content: { front: { text: "Q1" }, back: { text: "A1" } } });
        onCard({ content: { front: { text: "Q2" }, back: { text: "A2" } } });
        return "success" as StreamResult;
      },
    );

    const { result } = renderRuns(harness);

    await act(async () => {
      await result.current.executeGenerateRun("A", "run-A", {} as CardGenerationStreamRequest);
    });

    const addCardActions = harness.dispatchToMap.filter((entry) => entry.action[0] === "addCard");
    expect(addCardActions.length).toBe(2);
    for (const entry of addCardActions) {
      expect(entry.id).toBe("A");
    }

    const stateB = harness.store.get(conversationsAtom)["B"];
    expect(stateB.messages).toHaveLength(0);
  });

  it("an aborted chat stream dispatches cancelRun to the originating conversation", async () => {
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(upsertConversationAtom, makeConversation("B"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "run-A",
        mode: "chat",
        request: {},
      },
    ]);
    harness.store.set(assistantConversationStateAtom, [
      "addAssistantMessage",
      {
        runId: "run-A",
        kind: "chat-text",
        text: "",
      },
    ]);
    harness.store.set(setCurrentConversationIdAtom, "B");

    wire.streamChat = vi.fn(async (_request: ChatStreamRequest, onChunk: (chunk: string) => void) => {
      onChunk("partial");
      return { streamResult: "aborted" as StreamResult, usage: null };
    });

    const { result } = renderRuns(harness);

    await act(async () => {
      await result.current.executeChatRun("A", "run-A", {} as ChatStreamRequest);
    });

    const cancelActions = harness.dispatchToMap.filter((entry) => entry.action[0] === "cancelRun");
    expect(cancelActions).toHaveLength(1);
    expect(cancelActions[0].id).toBe("A");
  });

  it("bumps the pending save when a successful card generation run completes", async () => {
    // WHY: terminal-stream actions go through `dispatchToConversation` (per-id)
    // and therefore do NOT bump the pending-save counter on their own.
    // Without an explicit bump, the throttled save scheduled at run
    // start would fire during streaming and persist a successful run
    // as "canceled" (via `cancelStreamingRuns`) before the real
    // "success" status is ever saved — which is the
    // `Interrupted after 0s` reload bug.
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "run-A",
        mode: "cards",
        request: {},
      },
    ]);

    wire.generate = vi.fn(
      async (
        _request: CardGenerationStreamRequest,
        onCard: (card: { content: Record<string, { text: string }> }) => void = () => undefined,
      ) => {
        onCard({ content: { front: { text: "Q1" }, back: { text: "A1" } } });
        return "success" as StreamResult;
      },
    );

    const { result } = renderRuns(harness);

    await act(async () => {
      await result.current.executeGenerateRun("A", "run-A", {} as CardGenerationStreamRequest);
    });

    const completeActions = harness.dispatchToMap.filter((entry) => entry.action[0] === "completeRun");
    expect(completeActions).toHaveLength(1);
    expect(completeActions[0].id).toBe("A");

    expect(harness.bumpPendingSave).toHaveBeenCalledTimes(1);
  });

  it("bumps the pending save when an aborted card generation run is canceled", async () => {
    // WHY: same as the success case — a user-initiated cancel must
    // also schedule a save with the real terminal state, not a
    // `cancelStreamingRuns`-derived snapshot.
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "run-A",
        mode: "cards",
        request: {},
      },
    ]);

    wire.generate = vi.fn(async () => "aborted" as StreamResult);

    const { result } = renderRuns(harness);

    await act(async () => {
      await result.current.executeGenerateRun("A", "run-A", {} as CardGenerationStreamRequest);
    });

    const cancelActions = harness.dispatchToMap.filter((entry) => entry.action[0] === "cancelRun");
    expect(cancelActions).toHaveLength(1);
    expect(cancelActions[0].id).toBe("A");

    expect(harness.bumpPendingSave).toHaveBeenCalledTimes(1);
  });

  it("an aborted chat run re-dispatches the final accumulated text via finalize (A)", async () => {
    // WHY: the chat finalize hook must re-dispatch `updateAssistantText`
    // with the full accumulated text on abort so the persisted assistant
    // message reflects everything received before the stream was torn
    // down. This pins behavior that the shared executor inherits from the
    // pre-refactor `executeChatRun`.
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, ["startRun", { runId: "run-A", mode: "chat", request: {} }]);
    harness.store.set(assistantConversationStateAtom, [
      "addAssistantMessage",
      { runId: "run-A", kind: "chat-text", text: "" },
    ]);

    wire.streamChat = vi.fn(async (_request: ChatStreamRequest, onChunk: (chunk: string) => void) => {
      onChunk("partial ");
      onChunk("text");
      return { streamResult: "aborted" as StreamResult, usage: null };
    });

    const { result } = renderRuns(harness);

    await act(async () => {
      await result.current.executeChatRun("A", "run-A", {} as ChatStreamRequest);
    });

    const textActions = harness.dispatchToMap
      .filter((e) => e.action[0] === "updateAssistantText")
      .map((e) => e.action[1] as { runId: string; text: string });
    const finalText = textActions.at(-1);
    expect(finalText?.text).toBe("partial text");
    // The finalize re-dispatch is additional to the per-chunk dispatches.
    expect(textActions.filter((a) => a.text === "partial text").length).toBeGreaterThanOrEqual(2);
  });

  it("dispatches setUsage with the transport-reported usage on a successful chat run", async () => {
    // WHY: chat's finalize dispatches `setUsage` when the transport
    // reports usage; cards have no equivalent. Pinning this guards the
    // kind-specific finalize hook against the unified executor.
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, ["startRun", { runId: "run-A", mode: "chat", request: {} }]);
    harness.store.set(assistantConversationStateAtom, [
      "addAssistantMessage",
      { runId: "run-A", kind: "chat-text", text: "" },
    ]);

    const usage: StreamUsage = { input: 10, output: 5 } as unknown as StreamUsage;
    wire.streamChat = vi.fn(async (_request: ChatStreamRequest, onChunk: (chunk: string) => void) => {
      onChunk("hi");
      return { streamResult: "success" as StreamResult, usage };
    });

    const { result } = renderRuns(harness);

    await act(async () => {
      await result.current.executeChatRun("A", "run-A", {} as ChatStreamRequest);
    });

    const setUsageActions = harness.dispatchToMap.filter((e) => e.action[0] === "setUsage");
    expect(setUsageActions).toHaveLength(1);
    expect(setUsageActions[0].id).toBe("A");
    expect((setUsageActions[0].action[1] as { runId: string; usage: StreamUsage }).usage).toBe(usage);
  });
});
