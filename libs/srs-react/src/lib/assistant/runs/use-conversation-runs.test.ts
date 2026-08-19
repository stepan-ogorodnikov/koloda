import type { ChatStreamGenerator, ChatStreamRequest, StreamUsage } from "@koloda/ai";
import { aiRuntimeAtom } from "@koloda/core-react";
import type { TemplateFields } from "@koloda/srs";
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
  const dispatchToMap: Array<{
    id: string;
    action: ConversationReducerAction;
  }> = [];
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
  const chatExecutionProfiles: string[] = [];

  store.set(aiRuntimeAtom, {
    listModels: vi.fn(),
    chat: (profileId, request, onChunk, signal) => {
      if (!profileId) throw new Error("Missing profile identity");
      chatExecutionProfiles.push(profileId);
      return chatStreamGenerator(request, onChunk, signal);
    },
  });
  ensureAssistantEngine(store);

  const getState: GetState = () => store.get(assistantConversationStateAtom);

  return {
    store,
    getState,
    touch,
    dispatchToMap,
    chatStreamGenerator,
    chatExecutionProfiles,
  };
}

/** Test helpers wrap typed commands — production callers use `dispatch` only. */
function renderRuns(_harness: ReturnType<typeof createHarness>) {
  return renderHook(() => {
    const { dispatch } = useConversationRuns();
    return {
      dispatch,
      executeChatRun: (conversationId: string, runId: string, request: ChatStreamRequest) =>
        dispatch({
          type: "submit",
          conversationId,
          input: { kind: "chat", runId, request, execution: chatExecution },
        }) as Promise<void>,
      retryRun: (
        conversationId: string,
        runId: string,
        request: ChatStreamRequest,
        templateFields: TemplateFields | null,
        modelName?: string,
      ) =>
        dispatch({
          type: "retry",
          conversationId,
          input: {
            runId,
            request,
            templateFields,
            modelName,
            execution: chatExecution,
          },
        }) as Promise<void>,
      cancel: (conversationId: string, runId: string) => {
        dispatch({ type: "cancel", conversationId, runId });
      },
    };
  });
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

const chatExecution = { profileId: "profile-chat" };

describe("useConversationRuns", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    resetAssistantEngineForTests();
  });

  it("exposes only dispatch as the production execution ingress", () => {
    createHarness();
    const { result } = renderHook(() => useConversationRuns());
    expect(Object.keys(result.current)).toEqual(["dispatch"]);
    expect(typeof result.current.dispatch).toBe("function");
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
    expect(stateA.messages.at(-1)?.parts[0]).toEqual({
      type: "text",
      text: "Hello world",
    });

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

  it("an unrequested AbortError fails the originating conversation run", async () => {
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(upsertConversationAtom, makeConversation("B"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "run-A",
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
    const failedActions = harness.dispatchToMap.filter((entry) => entry.action[0] === "runFailed");
    expect(cancelActions).toHaveLength(0);
    expect(failedActions).toHaveLength(1);
    expect(failedActions[0].id).toBe("A");
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
    harness.store.set(assistantConversationStateAtom, ["startRun", { runId: "run-A" }]);
    harness.store.set(assistantConversationStateAtom, [
      "addAssistantMessage",
      { runId: "run-A", kind: "chat-text", text: "" },
    ]);

    harness.chatStreamGenerator.mockImplementation(async (_request, onChunk, signal) => {
      onChunk("partial ");
      onChunk("text");
      await holdUntilAborted(signal);
      return undefined;
    });

    const { result } = renderRuns(harness);

    const runPromise = act(async () => {
      await result.current.executeChatRun("A", "run-A", {} as ChatStreamRequest);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      result.current.cancel("A", "run-A");
    });
    await runPromise;

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
    harness.store.set(assistantConversationStateAtom, ["startRun", { runId: "run-A" }]);
    harness.store.set(assistantConversationStateAtom, [
      "addAssistantMessage",
      { runId: "run-A", kind: "chat-text", text: "" },
    ]);

    const usage: StreamUsage = {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    };
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

  it("in-flight retry for A stays owned by A after UI switches to B", async () => {
    const harness = createHarness();
    harness.store.set(
      upsertConversationAtom,
      makeConversation("A", {
        runs: {
          "run-a": {
            id: "run-a",
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
          {
            id: "user-run-a",
            role: "user",
            parts: [{ type: "text", text: "hello" }],
          },
          {
            id: "assistant-run-a",
            role: "assistant",
            parts: [{ type: "text", text: "old" }],
          },
        ],
      }),
    );
    harness.store.set(upsertConversationAtom, makeConversation("B"));
    harness.store.set(setCurrentConversationIdAtom, "A");

    let releaseRetry!: () => void;
    const retryGate = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });

    harness.chatStreamGenerator.mockImplementation(async (_request, onChunk) => {
      onChunk("retried-a");
      await retryGate;
      return undefined;
    });

    const { result } = renderRuns(harness);

    let retryPromise!: Promise<void>;
    act(() => {
      retryPromise = result.current.retryRun("A", "run-a", {} as ChatStreamRequest, null, "m");
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Switch UI current to B while A's retry is still in flight.
    harness.store.set(setCurrentConversationIdAtom, "B");

    await act(async () => {
      releaseRetry();
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

  it("stores the retry's data access snapshot on the restarted run, keeping identity", async () => {
    const harness = createHarness();
    harness.store.set(
      upsertConversationAtom,
      makeConversation("A", {
        runs: {
          "run-a": {
            id: "run-a",
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
      }),
    );
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.chatStreamGenerator.mockImplementation(async () => undefined);

    const dataAccess = { context: "User decks:", manifest: { decks: [], writeTarget: null } };
    const { result } = renderRuns(harness);

    await act(async () => {
      await result.current.dispatch({
        type: "retry",
        conversationId: "A",
        input: {
          runId: "run-a",
          request: {} as ChatStreamRequest,
          templateFields: null,
          execution: chatExecution,
          dataAccess,
        },
      });
    });

    // WHY: full chain (command → engine event → store adapter → reducer) —
    // the restarted run must carry the exact snapshot object by identity.
    expect(harness.getState().runs["run-a"].dataAccess).toBe(dataAccess);
  });

  it("executes A with A's identity after React renders B", async () => {
    const harness = createHarness();
    let releaseRun!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    harness.chatStreamGenerator.mockImplementation(async () => {
      await gate;
      return undefined;
    });

    const { result, rerender } = renderHook(
      ({ profileId }: { profileId: string }) => {
        const { dispatch } = useConversationRuns();
        return {
          profileId,
          executeChatRun: (
            conversationId: string,
            runId: string,
            request: ChatStreamRequest,
            execution: { profileId: string },
          ) =>
            dispatch({
              type: "submit",
              conversationId,
              input: { kind: "chat", runId, request, execution },
            }) as Promise<void>,
        };
      },
      { initialProps: { profileId: "profile-a" } },
    );

    const identity = { profileId: result.current.profileId };
    const runA = result.current.executeChatRun(
      "A",
      "run-a",
      { input: { modelId: "model-a", prompt: "a" }, messages: [] },
      identity,
    );

    // This mirrors the route/profile render that previously replaced the
    // module-level transport closure while A waited in the serial queue.
    rerender({ profileId: "profile-b" });
    identity.profileId = "profile-b";
    releaseRun();
    await runA;

    expect(harness.chatExecutionProfiles).toEqual(["profile-a"]);
    expect(harness.chatExecutionProfiles).not.toContain("profile-b");
  });

  it("shutdownAssistantGracefully interrupts streaming runs with app_shutdown", async () => {
    const harness = createHarness();
    harness.store.set(upsertConversationAtom, makeConversation("A"));
    harness.store.set(setCurrentConversationIdAtom, "A");
    harness.store.set(assistantConversationStateAtom, ["startRun", { runId: "run-1" }]);
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
