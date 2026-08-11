import type { AIChatMode, ChatStreamRequest } from "@koloda/ai";
import type { CardGenerationStreamRequest } from "@koloda/ai-react";
import { AssistantDuplicateRunError } from "@koloda/assistant";
import type { TemplateFields } from "@koloda/srs";
import { act, renderHook } from "@testing-library/react";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantConversationConfig } from "../state/assistant-conversation-config";
import { userMessageId } from "../state/assistant-messages";
import type { ConversationReducerAction, ConversationReducerState } from "../state/conversation-reducer";
import { initialConversationState } from "../state/conversation-reducer";
import {
  assistantConversationStateAtom,
  currentConversationIdAtom,
  upsertConversationAtom,
} from "../state/conversation-store";
import { useRunOrchestration } from "./use-run-orchestration";

// WHY: `handleRetry` must validate before starting a stream so an invalid
// retry (no prompt/profile/model/template) never reaches the engine.

function makeConfig(overrides: Partial<AssistantConversationConfig> = {}): AssistantConversationConfig {
  return {
    profileId: "prof-1",
    modelId: "model-1",
    modelName: "GPT-x",
    temperature: 0.5,
    reasoningEffort: "",
    deckId: 0,
    templateId: 0,
    template: null,
    cardsPromptTemplate: null,
    chatPromptTemplate: null,
    _: ((m: unknown) => m) as never,
    ...overrides,
  };
}

describe("useRunOrchestration — handleRetry ordering", () => {
  let calls: Array<{ fn: string; args: unknown[] }>;
  let retryRun: ReturnType<typeof vi.fn>;
  let rememberLastUsedAIProfile: ReturnType<typeof vi.fn>;
  let dispatch: (action: ConversationReducerAction) => void;
  let store: ReturnType<typeof createStore>;
  let readState: () => ConversationReducerState;

  beforeEach(() => {
    calls = [];
    retryRun = vi.fn(async (...args: unknown[]) => calls.push({ fn: "retryRun", args }));
    rememberLastUsedAIProfile = vi.fn((...args: unknown[]) => calls.push({ fn: "rememberLastUsedAIProfile", args }));

    store = createStore();
    dispatch = (action) => store.set(assistantConversationStateAtom, action);
    readState = () => store.get(assistantConversationStateAtom);
  });

  // Seed a conversation into the test store, make it current, and build its
  // state through the real write path so `readState`/`dispatch` see
  // the same shape production does.
  function seedConversation(id: string) {
    store.set(upsertConversationAtom, {
      ...initialConversationState,
      id,
      createdAt: new Date(1),
    });
    store.set(currentConversationIdAtom, id);
  }

  function addChatRun(runId: string, opts: { withUserMessage?: boolean } = {}) {
    const { withUserMessage = true } = opts;
    if (withUserMessage) dispatch(["addUserMessage", { runId, text: "hello" }]);
    dispatch(["addAssistantMessage", { runId, kind: "chat-text", text: "" }]);
    dispatch(["startRun", { runId, mode: "chat" }]);
  }

  function orchestrate(cfg: AssistantConversationConfig) {
    return renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatch,
        dispatchLocal: vi.fn(),
        rememberLastUsedAIProfile,
        cancelActiveRun: vi.fn(),
        setMode: vi.fn(),
        executeChatRun: vi.fn(async () => undefined) as never,
        executeGenerateRun: vi.fn(async () => undefined) as never,
        retryRun: retryRun as never,
        ensureConversationId: () => "conv-1",
      }),
    );
  }

  it("an invalid retry (no profile) does not start a stream", async () => {
    seedConversation("conv-1");
    addChatRun("run-1");
    const cfg = makeConfig({ profileId: "" });

    const { result } = orchestrate(cfg);
    await act(async () => {
      await result.current.handleRetry("run-1");
    });

    const names = calls.map((c) => c.fn);
    expect(names).not.toContain("retryRun");
    expect(names).not.toContain("rememberLastUsedAIProfile");
    expect(retryRun).not.toHaveBeenCalled();
  });

  it("an invalid retry (run missing the user message → empty prompt) does not start a stream", async () => {
    seedConversation("conv-1");
    addChatRun("run-2", { withUserMessage: false });
    const cfg = makeConfig();

    const { result } = orchestrate(cfg);
    await act(async () => {
      await result.current.handleRetry("run-2");
    });

    expect(retryRun).not.toHaveBeenCalled();
  });

  it("a valid chat retry remembers profile then dispatches retryRun", async () => {
    seedConversation("conv-1");
    addChatRun("run-1");
    const cfg = makeConfig();

    const { result } = orchestrate(cfg);
    await act(async () => {
      await result.current.handleRetry("run-1");
    });

    const order = calls.map((c) => c.fn);
    expect(order.indexOf("rememberLastUsedAIProfile")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("retryRun")).toBeGreaterThan(order.indexOf("rememberLastUsedAIProfile"));

    expect(rememberLastUsedAIProfile).toHaveBeenCalledWith(cfg.profileId, cfg.modelId);

    expect(retryRun).toHaveBeenCalledTimes(1);
    const [conversationId, runId, request, templateFields, mode, modelName] = retryRun.mock.calls[0] as [
      string,
      string,
      ChatStreamRequest | CardGenerationStreamRequest,
      TemplateFields | null,
      AIChatMode,
      string | undefined,
    ];
    expect(conversationId).toBe("conv-1");
    expect(runId).toBe("run-1");
    expect(templateFields).toBeNull();
    expect(mode).toBe("chat");
    expect(modelName).toBe("GPT-x");
    expect(request).toBeTypeOf("object");
  });
});

describe("useRunOrchestration — atomic submitTurn", () => {
  let store: ReturnType<typeof createStore>;
  let dispatch: (action: ConversationReducerAction) => void;
  let readState: () => ConversationReducerState;
  let dispatched: ConversationReducerAction[];
  let executeChatRun: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dispatched = [];
    store = createStore();
    dispatch = (action) => {
      dispatched.push(action);
      store.set(assistantConversationStateAtom, action);
    };
    readState = () => store.get(assistantConversationStateAtom);
    executeChatRun = vi.fn(async () => undefined);
  });

  it("handleGenerate dispatches a single submitTurn (not three separate actions)", async () => {
    store.set(upsertConversationAtom, {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date(1),
    });
    store.set(currentConversationIdAtom, "conv-1");

    const cfg = makeConfig();
    const { result } = renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatch,
        dispatchLocal: vi.fn(),
        rememberLastUsedAIProfile: vi.fn(),
        cancelActiveRun: vi.fn(),
        setMode: vi.fn(),
        executeChatRun: executeChatRun as never,
        executeGenerateRun: vi.fn(async () => undefined) as never,
        retryRun: vi.fn(async () => undefined) as never,
        ensureConversationId: () => "conv-1",
      }),
    );

    await act(async () => {
      await result.current.handleGenerate("Hello atomic");
    });

    const turnActions = dispatched.filter((a) => a[0] === "submitTurn");
    expect(turnActions).toHaveLength(1);
    expect(dispatched.some((a) => a[0] === "addUserMessage")).toBe(false);
    expect(dispatched.some((a) => a[0] === "startRun")).toBe(false);
    expect(dispatched.some((a) => a[0] === "addAssistantMessage")).toBe(false);

    const payload = turnActions[0]![1] as {
      text: string;
      mode: string;
      kind: string;
      assistantText: string;
    };
    expect(payload).toMatchObject({
      text: "Hello atomic",
      mode: "chat",
      kind: "chat-text",
      assistantText: "",
    });

    const state = readState();
    expect(state.messages).toHaveLength(2);
    expect(state.activeRunId).not.toBeNull();
    expect(executeChatRun).toHaveBeenCalledTimes(1);
  });
});

describe("useRunOrchestration — submit in-flight guard", () => {
  let store: ReturnType<typeof createStore>;
  let dispatch: (action: ConversationReducerAction) => void;
  let readState: () => ConversationReducerState;

  beforeEach(() => {
    store = createStore();
    dispatch = (action) => store.set(assistantConversationStateAtom, action);
    readState = () => store.get(assistantConversationStateAtom);
  });

  function seedConversation(id: string) {
    store.set(upsertConversationAtom, {
      ...initialConversationState,
      id,
      createdAt: new Date(1),
    });
    store.set(currentConversationIdAtom, id);
  }

  function addFailedChatRun(runId: string) {
    dispatch(["addUserMessage", { runId, text: "hello" }]);
    dispatch(["addAssistantMessage", { runId, kind: "chat-text", text: "" }]);
    dispatch(["startRun", { runId, mode: "chat" }]);
    dispatch(["runFailed", { runId, error: { message: "boom" } }]);
  }

  it("same-tick double handleGenerate only starts one executeChatRun", async () => {
    seedConversation("conv-1");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const executeChatRun = vi.fn(async () => {
      await gate;
    });

    const cfg = makeConfig();
    const { result } = renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatch,
        dispatchLocal: vi.fn(),
        rememberLastUsedAIProfile: vi.fn(),
        cancelActiveRun: vi.fn(),
        setMode: vi.fn(),
        executeChatRun: executeChatRun as never,
        executeGenerateRun: vi.fn(async () => undefined) as never,
        retryRun: vi.fn(async () => undefined) as never,
        ensureConversationId: () => "conv-1",
      }),
    );

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.handleGenerate("one");
      second = result.current.handleGenerate("two");
    });

    await act(async () => {
      release();
      await Promise.all([first, second]);
    });

    expect(executeChatRun).toHaveBeenCalledTimes(1);
  });

  it("revert while submit in-flight: resubmit does not commitRevert until guard clears", async () => {
    seedConversation("conv-1");
    const dispatched: ConversationReducerAction[] = [];
    const trackingDispatch = (action: ConversationReducerAction) => {
      dispatched.push(action);
      dispatch(action);
    };

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const executeChatRun = vi.fn(async () => {
      await gate;
    });

    const cfg = makeConfig();
    const { result } = renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatch: trackingDispatch,
        dispatchLocal: vi.fn(),
        rememberLastUsedAIProfile: vi.fn(),
        cancelActiveRun: vi.fn(),
        setMode: vi.fn(),
        executeChatRun: executeChatRun as never,
        executeGenerateRun: vi.fn(async () => undefined) as never,
        retryRun: vi.fn(async () => undefined) as never,
        ensureConversationId: () => "conv-1",
      }),
    );

    let first!: Promise<void>;
    act(() => {
      first = result.current.handleGenerate("first");
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(executeChatRun).toHaveBeenCalledTimes(1);

    const activeRunId = readState().activeRunId;
    expect(activeRunId).not.toBeNull();
    const revertTarget = userMessageId(activeRunId!);

    // WHY: Mimic handleRevert while the aborted execute* has not settled —
    // revertState is set but the conversation remains in the in-flight set.
    act(() => {
      dispatch(["setRevertState", { revertedToUserMessageId: revertTarget, preRevertInputText: "" }]);
    });
    expect(readState().revertState).not.toBeNull();

    await act(async () => {
      await result.current.handleGenerate("resubmit-while-inflight");
    });

    expect(dispatched.some((a) => a[0] === "commitRevert")).toBe(false);
    expect(readState().revertState).not.toBeNull();
    expect(executeChatRun).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await first;
    });

    await act(async () => {
      await result.current.handleGenerate("resubmit-after-clear");
    });

    expect(dispatched.some((a) => a[0] === "commitRevert")).toBe(true);
    expect(readState().revertState).toBeNull();
    expect(executeChatRun).toHaveBeenCalledTimes(2);
  });

  it("same-tick double handleRetry only starts one retryRun", async () => {
    seedConversation("conv-1");
    addFailedChatRun("run-1");

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const retryRun = vi.fn(async () => {
      await gate;
    });

    const cfg = makeConfig();
    const { result } = renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatch,
        dispatchLocal: vi.fn(),
        rememberLastUsedAIProfile: vi.fn(),
        cancelActiveRun: vi.fn(),
        setMode: vi.fn(),
        executeChatRun: vi.fn(async () => undefined) as never,
        executeGenerateRun: vi.fn(async () => undefined) as never,
        retryRun: retryRun as never,
        ensureConversationId: () => "conv-1",
      }),
    );

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.handleRetry("run-1");
      second = result.current.handleRetry("run-1");
    });

    await act(async () => {
      release();
      await Promise.all([first, second]);
    });

    expect(retryRun).toHaveBeenCalledTimes(1);
  });

  it("A streaming does not block submit on B", async () => {
    seedConversation("A");
    store.set(upsertConversationAtom, {
      ...initialConversationState,
      id: "B",
      createdAt: new Date(2),
    });

    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const executeChatRun = vi.fn(async (conversationId: string) => {
      if (conversationId === "A") await gateA;
    });

    const cfg = makeConfig();
    const { result } = renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatch,
        dispatchLocal: vi.fn(),
        rememberLastUsedAIProfile: vi.fn(),
        cancelActiveRun: vi.fn(),
        setMode: vi.fn(),
        executeChatRun: executeChatRun as never,
        executeGenerateRun: vi.fn(async () => undefined) as never,
        retryRun: vi.fn(async () => undefined) as never,
        ensureConversationId: () => store.get(currentConversationIdAtom) ?? undefined,
      }),
    );

    let runA!: Promise<void>;
    act(() => {
      runA = result.current.handleGenerate("from A");
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(executeChatRun).toHaveBeenCalledTimes(1);
    expect(executeChatRun.mock.calls[0]?.[0]).toBe("A");

    store.set(currentConversationIdAtom, "B");

    await act(async () => {
      await result.current.handleGenerate("from B");
    });

    expect(executeChatRun).toHaveBeenCalledTimes(2);
    expect(executeChatRun.mock.calls[1]?.[0]).toBe("B");

    await act(async () => {
      releaseA();
      await runA;
    });
  });

  it("swallows AssistantDuplicateRunError from executeChatRun", async () => {
    seedConversation("conv-1");
    const executeChatRun = vi.fn(async () => {
      throw new AssistantDuplicateRunError("conv-1", "run-new", "run-old");
    });

    const cfg = makeConfig();
    const { result } = renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatch,
        dispatchLocal: vi.fn(),
        rememberLastUsedAIProfile: vi.fn(),
        cancelActiveRun: vi.fn(),
        setMode: vi.fn(),
        executeChatRun: executeChatRun as never,
        executeGenerateRun: vi.fn(async () => undefined) as never,
        retryRun: vi.fn(async () => undefined) as never,
        ensureConversationId: () => "conv-1",
      }),
    );

    await act(async () => {
      await expect(result.current.handleGenerate("dup")).resolves.toBeUndefined();
    });
  });

  it("swallows AssistantDuplicateRunError from retryRun", async () => {
    seedConversation("conv-1");
    addFailedChatRun("run-1");
    const retryRun = vi.fn(async () => {
      throw new AssistantDuplicateRunError("conv-1", "run-1", "run-other");
    });

    const cfg = makeConfig();
    const { result } = renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatch,
        dispatchLocal: vi.fn(),
        rememberLastUsedAIProfile: vi.fn(),
        cancelActiveRun: vi.fn(),
        setMode: vi.fn(),
        executeChatRun: vi.fn(async () => undefined) as never,
        executeGenerateRun: vi.fn(async () => undefined) as never,
        retryRun: retryRun as never,
        ensureConversationId: () => "conv-1",
      }),
    );

    await act(async () => {
      await expect(result.current.handleRetry("run-1")).resolves.toBeUndefined();
    });
  });

  it("rethrows non-duplicate errors from executeChatRun", async () => {
    seedConversation("conv-1");
    const executeChatRun = vi.fn(async () => {
      throw new Error("transport blew up");
    });

    const cfg = makeConfig();
    const { result } = renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatch,
        dispatchLocal: vi.fn(),
        rememberLastUsedAIProfile: vi.fn(),
        cancelActiveRun: vi.fn(),
        setMode: vi.fn(),
        executeChatRun: executeChatRun as never,
        executeGenerateRun: vi.fn(async () => undefined) as never,
        retryRun: vi.fn(async () => undefined) as never,
        ensureConversationId: () => "conv-1",
      }),
    );

    await act(async () => {
      await expect(result.current.handleGenerate("fail")).rejects.toThrow("transport blew up");
    });
  });

  it("rethrows non-duplicate errors from retryRun", async () => {
    seedConversation("conv-1");
    addFailedChatRun("run-1");
    const retryRun = vi.fn(async () => {
      throw new Error("retry transport blew up");
    });

    const cfg = makeConfig();
    const { result } = renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatch,
        dispatchLocal: vi.fn(),
        rememberLastUsedAIProfile: vi.fn(),
        cancelActiveRun: vi.fn(),
        setMode: vi.fn(),
        executeChatRun: vi.fn(async () => undefined) as never,
        executeGenerateRun: vi.fn(async () => undefined) as never,
        retryRun: retryRun as never,
        ensureConversationId: () => "conv-1",
      }),
    );

    await act(async () => {
      await expect(result.current.handleRetry("run-1")).rejects.toThrow("retry transport blew up");
    });
  });
});
