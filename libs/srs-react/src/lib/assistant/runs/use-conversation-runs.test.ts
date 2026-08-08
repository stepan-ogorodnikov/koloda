import type { ChatStreamGenerator, ChatStreamRequest, GeneratedCard, StreamUsage } from "@koloda/ai";
import type { CardGenerationExecutor, CardGenerationStreamRequest } from "@koloda/assistant";
import { act, renderHook } from "@testing-library/react";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationReducerAction, ConversationReducerState } from "../state/conversation-reducer";
import { initialConversationState } from "../state/conversation-reducer";
import * as conversationStore from "../state/conversation-store";
import {
  assistantConversationStateAtom,
  conversationsAtom,
  pendingSaveByConversationAtom,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "../state/conversation-store";
import {
  ensureAssistantEngine,
  registerAssistantEngineTransports,
  resetAssistantEngineForTests,
  shutdownAssistantGracefully,
} from "./use-assistant-engine-host";
import { useConversationRuns } from "./use-conversation-runs";

type GetState = () => ConversationReducerState;

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
  const touch = vi.fn();

  const originalDispatch = conversationStore.dispatchToConversationOnStore;
  const originalTouch = conversationStore.touchConversationOnStore;

  vi.spyOn(conversationStore, "dispatchToConversationOnStore").mockImplementation((s, id, action) => {
    dispatchToMap.push({ id, action });
    return originalDispatch(s, id, action);
  });
  vi.spyOn(conversationStore, "touchConversationOnStore").mockImplementation((s, conversationId) => {
    touch(conversationId);
    return originalTouch(s, conversationId);
  });

  const chatStreamGenerator = vi.fn<ChatStreamGenerator>();
  const streamGenerator = vi.fn<CardGenerationExecutor>();

  ensureAssistantEngine(store);
  registerAssistantEngineTransports({ chatStreamGenerator, streamGenerator });

  const getState: GetState = () => store.get(assistantConversationStateAtom);

  return {
    store,
    getState,
    touch,
    dispatchToMap,
    chatStreamGenerator,
    streamGenerator,
  };
}

function renderRuns(harness: ReturnType<typeof createHarness>) {
  return renderHook(() =>
    useConversationRuns({
      streamGenerator: harness.streamGenerator,
      chatStreamGenerator: harness.chatStreamGenerator,
    }),
  );
}

function holdUntilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

describe("useConversationRuns", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    resetAssistantEngineForTests();
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
    let resolveStream!: () => void;
    harness.chatStreamGenerator.mockImplementation(async (_request, onChunk) => {
      streamStarted = true;
      onChunk("Hello ");
      onChunk("world");
      harness.store.set(setCurrentConversationIdAtom, "B");
      await new Promise<void>((resolve) => {
        resolveStream = resolve;
      });
      return undefined;
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
      resolveStream();
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

    expect(harness.touch).toHaveBeenCalledWith("A");
    expect(harness.touch).not.toHaveBeenCalledWith("B");
  });

  it("completing a background run on A while viewing B dirties only A", async () => {
    // WHY: parameterless touch() used to dirty the currently viewed
    // conversation. Background completion on A must bump A's pending-save
    // counter and leave B clean.
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(upsertConversationAtom, makeConversation("B"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "run-1",
        mode: "chat",
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

    harness.chatStreamGenerator.mockImplementation(async (_request, onChunk) => {
      onChunk("done");
      harness.store.set(setCurrentConversationIdAtom, "B");
      return undefined;
    });

    const { result } = renderRuns(harness);

    await act(async () => {
      await result.current.executeChatRun("A", "run-1", {} as ChatStreamRequest);
    });

    const pending = harness.store.get(pendingSaveByConversationAtom);
    expect(pending["A"] ?? 0).toBeGreaterThan(0);
    expect(pending["B"] ?? 0).toBe(0);
    expect(harness.touch.mock.calls.every(([id]) => id === "A")).toBe(true);
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

    harness.streamGenerator.mockImplementation(async (_request, onCard) => {
      onCard({ content: { front: { text: "Q1" }, back: { text: "A1" } } } as GeneratedCard);
      onCard({ content: { front: { text: "Q2" }, back: { text: "A2" } } } as GeneratedCard);
    });

    const { result } = renderRuns(harness);

    await act(async () => {
      await result.current.executeGenerateRun("A", "run-A", {} as CardGenerationStreamRequest);
    });

    const addCardActions = harness.dispatchToMap.filter((entry) => entry.action[0] === "addCard");
    expect(addCardActions).toHaveLength(2);
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

    harness.chatStreamGenerator.mockImplementation(async (_request, onChunk) => {
      onChunk("partial");
      throw new DOMException("Aborted", "AbortError");
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
    // Without an explicit bump, the throttled streaming checkpoint would
    // remain the latest save and a successful terminal status would never
    // be persisted.
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "run-A",
        mode: "cards",
      },
    ]);

    harness.streamGenerator.mockImplementation(async (_request, onCard) => {
      onCard({ content: { front: { text: "Q1" }, back: { text: "A1" } } } as GeneratedCard);
    });

    const { result } = renderRuns(harness);

    await act(async () => {
      await result.current.executeGenerateRun("A", "run-A", {} as CardGenerationStreamRequest);
    });

    const completeActions = harness.dispatchToMap.filter((entry) => entry.action[0] === "completeRun");
    expect(completeActions).toHaveLength(1);
    expect(completeActions[0].id).toBe("A");

    // One touch for the card chunk + one for terminal success.
    expect(harness.touch).toHaveBeenCalledTimes(2);
    expect(harness.touch).toHaveBeenCalledWith("A");
  });

  it("bumps the pending save when an aborted card generation run is canceled", async () => {
    // WHY: same as the success case — a user-initiated cancel must
    // also schedule a save with the real terminal state (`canceled`/`user`),
    // not leave only a streaming checkpoint on disk.
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "run-A",
        mode: "cards",
      },
    ]);

    harness.streamGenerator.mockImplementation(async () => {
      throw new DOMException("Aborted", "AbortError");
    });

    const { result } = renderRuns(harness);

    await act(async () => {
      await result.current.executeGenerateRun("A", "run-A", {} as CardGenerationStreamRequest);
    });

    const cancelActions = harness.dispatchToMap.filter((entry) => entry.action[0] === "cancelRun");
    expect(cancelActions).toHaveLength(1);
    expect(cancelActions[0].id).toBe("A");

    expect(harness.touch).toHaveBeenCalledTimes(1);
    expect(harness.touch).toHaveBeenCalledWith("A");
  });

  it("bumps the pending save for the originating conversation when a run fails", async () => {
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(upsertConversationAtom, makeConversation("B"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "run-A",
        mode: "chat",
      },
    ]);
    harness.store.set(setCurrentConversationIdAtom, "B");

    harness.chatStreamGenerator.mockImplementation(async () => {
      throw new Error("provider blew up");
    });

    const { result } = renderRuns(harness);

    await act(async () => {
      await result.current.executeChatRun("A", "run-A", {} as ChatStreamRequest);
    });

    const failedActions = harness.dispatchToMap.filter((entry) => entry.action[0] === "runFailed");
    expect(failedActions).toHaveLength(1);
    expect(failedActions[0].id).toBe("A");

    const pending = harness.store.get(pendingSaveByConversationAtom);
    expect(pending["A"] ?? 0).toBeGreaterThan(0);
    expect(pending["B"] ?? 0).toBe(0);
    expect(harness.touch).toHaveBeenCalledWith("A");
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
    harness.store.set(assistantConversationStateAtom, ["startRun", { runId: "run-A", mode: "chat" }]);
    harness.store.set(assistantConversationStateAtom, [
      "addAssistantMessage",
      { runId: "run-A", kind: "chat-text", text: "" },
    ]);

    harness.chatStreamGenerator.mockImplementation(async (_request, onChunk) => {
      onChunk("partial ");
      onChunk("text");
      throw new DOMException("Aborted", "AbortError");
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
    harness.store.set(assistantConversationStateAtom, ["startRun", { runId: "run-A", mode: "chat" }]);
    harness.store.set(assistantConversationStateAtom, [
      "addAssistantMessage",
      { runId: "run-A", kind: "chat-text", text: "" },
    ]);

    const usage: StreamUsage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
    harness.chatStreamGenerator.mockImplementation(async (_request, onChunk) => {
      onChunk("hi");
      return usage;
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

  it("cancel(conversationId, runId) aborts only that run, leaving a concurrent same-mode stream running", async () => {
    // WHY: two chats on different conversations must each own a controller.
    // Mode-scoped cancel was not enough — the singleton stream hook aborted both.
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(upsertConversationAtom, makeConversation("B"));

    const signals: AbortSignal[] = [];
    harness.chatStreamGenerator.mockImplementation(async (_request, onChunk, signal) => {
      signals.push(signal);
      onChunk("chunk");
      await holdUntilAborted(signal);
    });

    const { result } = renderRuns(harness);

    let runA!: Promise<void>;
    let runB!: Promise<void>;
    act(() => {
      runA = result.current.executeChatRun("A", "run-A", {} as ChatStreamRequest);
      runB = result.current.executeChatRun("B", "run-B", {} as ChatStreamRequest);
    });

    await act(async () => {
      while (signals.length < 2) await Promise.resolve();
    });

    expect(signals[0]?.aborted).toBe(false);
    expect(signals[1]?.aborted).toBe(false);

    await act(async () => {
      result.current.cancel("A", "run-A");
      await runA;
    });

    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    const cancelActions = harness.dispatchToMap.filter((entry) => entry.action[0] === "cancelRun");
    expect(cancelActions).toHaveLength(1);
    expect(cancelActions[0]?.id).toBe("A");

    await act(async () => {
      result.current.cancel("B", "run-B");
      await runB;
    });

    expect(signals[1]?.aborted).toBe(true);
  });

  it("cancel(conversationId, runId) aborts only that run across chat + cards", async () => {
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(upsertConversationAtom, makeConversation("B"));

    const chatSignals: AbortSignal[] = [];
    const cardSignals: AbortSignal[] = [];

    harness.chatStreamGenerator.mockImplementation(async (_request, _onChunk, signal) => {
      chatSignals.push(signal);
      await holdUntilAborted(signal);
    });
    harness.streamGenerator.mockImplementation(async (_request, _onCard, signal) => {
      cardSignals.push(signal);
      await holdUntilAborted(signal);
    });

    const { result } = renderRuns(harness);

    let chatRun!: Promise<void>;
    let cardRun!: Promise<void>;
    act(() => {
      chatRun = result.current.executeChatRun("A", "run-chat", {} as ChatStreamRequest);
      cardRun = result.current.executeGenerateRun("B", "run-cards", {} as CardGenerationStreamRequest);
    });

    await act(async () => {
      while (chatSignals.length < 1 || cardSignals.length < 1) await Promise.resolve();
    });

    await act(async () => {
      result.current.cancel("A", "run-chat");
      await chatRun;
    });

    expect(chatSignals[0]?.aborted).toBe(true);
    expect(cardSignals[0]?.aborted).toBe(false);

    await act(async () => {
      result.current.cancel("B", "run-cards");
      await cardRun;
    });

    expect(cardSignals[0]?.aborted).toBe(true);
  });

  it("unmounting the hook does not abort an in-flight run", async () => {
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));

    const signals: AbortSignal[] = [];
    let resolveStream!: () => void;
    harness.chatStreamGenerator.mockImplementation(async (_request, onChunk, signal) => {
      signals.push(signal);
      onChunk("chunk");
      await new Promise<void>((resolve) => {
        resolveStream = resolve;
      });
    });

    const { result, unmount } = renderRuns(harness);

    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.executeChatRun("A", "run-1", {} as ChatStreamRequest);
    });

    await act(async () => {
      while (signals.length < 1) await Promise.resolve();
    });

    unmount();
    expect(signals[0]?.aborted).toBe(false);

    await act(async () => {
      resolveStream();
      await runPromise;
    });

    const completeActions = harness.dispatchToMap.filter((entry) => entry.action[0] === "completeRun");
    expect(completeActions).toHaveLength(1);
    expect(completeActions[0].id).toBe("A");
  });

  it("queued retry for A stays owned by A after UI switches to B", async () => {
    const harness = createHarness();
    harness.store.set(
      upsertConversationAtom,
      makeConversation("A", {
        runs: {
          "run-a": {
            id: "run-a",
            mode: "chat",
            status: "failed",
            cards: [],
            cardStatuses: {},
            error: { message: "boom" },
            startedAt: new Date(1),
            elapsedSeconds: null,
            modelName: "m",
            templateFields: null,
          },
        },
        messages: [
          { id: "user-run-a", role: "user", parts: [{ type: "text", text: "hello" }] },
          { id: "assistant-run-a", role: "assistant", parts: [{ type: "text", text: "old" }] },
        ],
      }),
    );
    harness.store.set(upsertConversationAtom, makeConversation("B"));
    harness.store.set(setCurrentConversationIdAtom, "A");

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let retryStarted = false;

    harness.chatStreamGenerator.mockImplementation(async (_request, onChunk) => {
      if (!retryStarted) {
        await firstGate;
        return undefined;
      }
      onChunk("retried-a");
      return undefined;
    });

    const { result } = renderRuns(harness);

    let firstRun!: Promise<void>;
    let retryPromise!: Promise<void>;
    act(() => {
      firstRun = result.current.executeChatRun("A", "run-blocker", {} as ChatStreamRequest);
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      retryPromise = result.current.retryRun("A", "run-a", {} as ChatStreamRequest, null, "chat", "m");
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Switch UI current to B while A's retry is still queued behind the blocker.
    harness.store.set(setCurrentConversationIdAtom, "B");

    retryStarted = true;
    await act(async () => {
      releaseFirst();
      await firstRun;
      await retryPromise;
    });

    const restartActions = harness.dispatchToMap.filter((e) => e.action[0] === "restartRun");
    expect(restartActions).toHaveLength(1);
    expect(restartActions[0]?.id).toBe("A");

    const clearActions = harness.dispatchToMap.filter(
      (e) => e.action[0] === "updateAssistantText" && (e.action[1] as { text?: string }).text === "",
    );
    expect(clearActions.every((e) => e.id === "A")).toBe(true);

    const chunkActions = harness.dispatchToMap.filter(
      (e) => e.action[0] === "updateAssistantText" && (e.action[1] as { text?: string }).text === "retried-a",
    );
    expect(chunkActions).toHaveLength(1);
    expect(chunkActions[0]?.id).toBe("A");

    expect(harness.dispatchToMap.some((e) => e.id === "B" && e.action[0] === "restartRun")).toBe(false);
    expect(harness.store.get(conversationsAtom)["B"]?.runs["run-a"]).toBeUndefined();
  });

  it("shutdownAssistantGracefully interrupts streaming runs with app_shutdown", async () => {
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, ["startRun", { runId: "run-1", mode: "chat" }]);
    harness.store.set(assistantConversationStateAtom, [
      "addAssistantMessage",
      { runId: "run-1", kind: "chat-text", text: "" },
    ]);

    harness.chatStreamGenerator.mockImplementation(async (_request, _onChunk, signal) => {
      await holdUntilAborted(signal);
    });

    const { result } = renderRuns(harness);

    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.executeChatRun("A", "run-1", {} as ChatStreamRequest);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await shutdownAssistantGracefully(harness.store, 0);
      await runPromise;
    });

    expect(harness.getState().runs["run-1"]?.status).toBe("interrupted");
    expect(harness.getState().runs["run-1"]?.reason).toBe("app_shutdown");
  });
});
