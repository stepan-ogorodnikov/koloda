import { ASSISTANT_TOOL_SPECS } from "@koloda/ai";
import { AssistantDuplicateRunError, AssistantEngineClosedError } from "@koloda/assistant";
import type { AssistantCommand } from "@koloda/assistant";
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
import type { DataAccessSnapshot } from "./data-access";
import { useRunOrchestration } from "./use-run-orchestration";

// WHY: `handleRetry` must validate before starting a stream so an invalid
// retry (no prompt/profile/model) never reaches the engine.

const CHAT_TOOLS = Object.keys(ASSISTANT_TOOL_SPECS);

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

type DispatchCommand = (command: AssistantCommand) => void | Promise<void>;

describe("useRunOrchestration — handleRetry ordering", () => {
  let calls: Array<{ fn: string; args: unknown[] }>;
  let dispatchCommand: ReturnType<typeof vi.fn<DispatchCommand>>;
  let rememberLastUsedAIProfile: ReturnType<typeof vi.fn<(profileId: string, modelId: string) => void>>;
  let dispatch: (action: ConversationReducerAction) => void;
  let store: ReturnType<typeof createStore>;
  let readState: () => ConversationReducerState;

  beforeEach(() => {
    calls = [];
    dispatchCommand = vi.fn<DispatchCommand>(async (command) => {
      calls.push({ fn: command.type, args: [command] });
    });
    rememberLastUsedAIProfile = vi.fn<(profileId: string, modelId: string) => void>((profileId, modelId) => {
      calls.push({ fn: "rememberLastUsedAIProfile", args: [profileId, modelId] });
    });

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
        dispatchCommand,
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
    expect(names).not.toContain("retry");
    expect(names).not.toContain("rememberLastUsedAIProfile");
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it("an invalid retry (run missing the user message → empty prompt) does not start a stream", async () => {
    seedConversation("conv-1");
    addChatRun("run-2", { withUserMessage: false });
    const cfg = makeConfig();

    const { result } = orchestrate(cfg);
    await act(async () => {
      await result.current.handleRetry("run-2");
    });

    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it("a valid chat retry remembers profile then dispatches retry command", async () => {
    seedConversation("conv-1");
    addChatRun("run-1");
    const cfg = makeConfig();

    const { result } = orchestrate(cfg);
    await act(async () => {
      await result.current.handleRetry("run-1");
    });

    const order = calls.map((c) => c.fn);
    expect(order.indexOf("rememberLastUsedAIProfile")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("retry")).toBeGreaterThan(order.indexOf("rememberLastUsedAIProfile"));

    expect(rememberLastUsedAIProfile).toHaveBeenCalledWith(cfg.profileId, cfg.modelId);

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const command = dispatchCommand.mock.calls[0]![0] as Extract<AssistantCommand, { type: "retry" }>;
    expect(command.type).toBe("retry");
    expect(command.conversationId).toBe("conv-1");
    expect(command.input.runId).toBe("run-1");
    expect(command.input.templateFields).toBeNull();
    expect(command.input.mode).toBe("chat");
    expect(command.input.modelName).toBe("GPT-x");
    expect(command.input.request).toBeTypeOf("object");
    expect(command.input.request).toMatchObject({ tools: CHAT_TOOLS });
    expect(command.input.request).not.toHaveProperty("dataContext");
    expect(command.input.execution).toEqual({ profileId: cfg.profileId });
  });
});

describe("useRunOrchestration — atomic submitTurn", () => {
  let store: ReturnType<typeof createStore>;
  let dispatch: (action: ConversationReducerAction) => void;
  let readState: () => ConversationReducerState;
  let dispatched: ConversationReducerAction[];
  let dispatchCommand: ReturnType<typeof vi.fn<DispatchCommand>>;
  let callOrder: string[];

  beforeEach(() => {
    dispatched = [];
    callOrder = [];
    store = createStore();
    dispatch = (action) => {
      dispatched.push(action);
      if (action[0] === "submitTurn") callOrder.push("submitTurn");
      store.set(assistantConversationStateAtom, action);
    };
    readState = () => store.get(assistantConversationStateAtom);
    dispatchCommand = vi.fn<DispatchCommand>(() => {
      callOrder.push("command");
      return Promise.resolve();
    });
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
        dispatchCommand,
        ensureConversationId: () => "conv-1",
      }),
    );

    await act(async () => {
      await result.current.handleGenerate("Hello atomic");
    });

    const turnActions = dispatched.filter((a) => a[0] === "submitTurn");
    expect(turnActions).toHaveLength(1);
    expect(callOrder).toEqual(["command", "submitTurn"]);
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
    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    expect(dispatchCommand.mock.calls[0]![0]).toMatchObject({
      type: "submit",
      conversationId: "conv-1",
      input: { kind: "chat", request: { tools: CHAT_TOOLS } },
    });
  });
});

describe("useRunOrchestration — always-chat submit", () => {
  let store: ReturnType<typeof createStore>;
  let dispatch: (action: ConversationReducerAction) => void;
  let readState: () => ConversationReducerState;
  let dispatchCommand: ReturnType<typeof vi.fn<DispatchCommand>>;

  beforeEach(() => {
    store = createStore();
    dispatch = (action) => store.set(assistantConversationStateAtom, action);
    readState = () => store.get(assistantConversationStateAtom);
    dispatchCommand = vi.fn<DispatchCommand>(() => Promise.resolve());
  });

  function seedConversation(id: string) {
    store.set(upsertConversationAtom, {
      ...initialConversationState,
      id,
      createdAt: new Date(1),
    });
    store.set(currentConversationIdAtom, id);
  }

  function orchestrate(cfg: AssistantConversationConfig) {
    return renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatch,
        dispatchLocal: vi.fn(),
        rememberLastUsedAIProfile: vi.fn(),
        cancelActiveRun: vi.fn(),
        dispatchCommand,
        ensureConversationId: () => "conv-1",
      }),
    );
  }

  it("submit passes chat tools and does not store a data-access snapshot", async () => {
    seedConversation("conv-1");

    const { result } = orchestrate(makeConfig());
    await act(async () => {
      await result.current.handleGenerate("hello");
    });

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const command = dispatchCommand.mock.calls[0]![0] as Extract<AssistantCommand, { type: "submit" }>;
    expect(command.input.kind).toBe("chat");
    if (command.input.kind !== "chat") throw new Error("expected chat submit");
    expect(command.input.request.tools).toEqual(CHAT_TOOLS);
    expect(command.input.request.tools).toEqual(["list_decks", "get_deck_cards", "propose_cards"]);
    expect(command.input.request).not.toHaveProperty("dataContext");

    const runId = readState().activeRunId;
    expect(runId).not.toBeNull();
    expect(readState().runs[runId!].dataAccess).toBeUndefined();
  });

  it("submit is chat even when the conversation mode is cards and no template is selected", async () => {
    seedConversation("conv-1");
    dispatch(["setMode", { mode: "cards" }]);
    dispatch(["setDeck", { deckId: 7 }]);

    const { result } = orchestrate(makeConfig({ template: null, templateId: 0, deckId: 7 }));
    await act(async () => {
      await result.current.handleGenerate("make cards");
    });

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const command = dispatchCommand.mock.calls[0]![0] as Extract<AssistantCommand, { type: "submit" }>;
    expect(command.input.kind).toBe("chat");
    expect(command.input.request).toMatchObject({ tools: CHAT_TOOLS });
    expect(command.input.request).not.toHaveProperty("dataContext");

    const runId = readState().activeRunId;
    expect(readState().runs[runId!].mode).toBe("chat");
  });
});

describe("useRunOrchestration — retry always chat", () => {
  let store: ReturnType<typeof createStore>;
  let dispatch: (action: ConversationReducerAction) => void;
  let readState: () => ConversationReducerState;
  let dispatchCommand: ReturnType<typeof vi.fn<DispatchCommand>>;

  beforeEach(() => {
    store = createStore();
    dispatch = (action) => store.set(assistantConversationStateAtom, action);
    readState = () => store.get(assistantConversationStateAtom);
    dispatchCommand = vi.fn(() => Promise.resolve());
  });

  function seedConversation(id: string) {
    store.set(upsertConversationAtom, {
      ...initialConversationState,
      id,
      createdAt: new Date(1),
    });
    store.set(currentConversationIdAtom, id);
  }

  function addFailedChatRun(runId: string, dataAccess?: DataAccessSnapshot) {
    dispatch(["addUserMessage", { runId, text: "hello" }]);
    dispatch(["addAssistantMessage", { runId, kind: "chat-text", text: "" }]);
    dispatch(["startRun", { runId, mode: "chat", dataAccess }]);
    dispatch(["runFailed", { runId, error: { message: "boom" } }]);
  }

  function orchestrate(cfg: AssistantConversationConfig = makeConfig()) {
    return renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatch,
        dispatchLocal: vi.fn(),
        rememberLastUsedAIProfile: vi.fn(),
        cancelActiveRun: vi.fn(),
        dispatchCommand,
        ensureConversationId: () => "conv-1",
      }),
    );
  }

  function retryCommand(index = 0): Extract<AssistantCommand, { type: "retry" }> {
    return dispatchCommand.mock.calls[index]![0] as Extract<AssistantCommand, { type: "retry" }>;
  }

  it("chat retry with a stored snapshot is inert: no request embed, still sends tools", async () => {
    seedConversation("conv-1");
    const stored: DataAccessSnapshot = {
      context: "User decks:\n- Deck: Old — 1 card — Template: Default (Front, Back)",
      manifest: { decks: [{ deckId: 1, title: "Old", cardCount: 1, templateTitle: "Default" }], writeTarget: null },
    };
    addFailedChatRun("run-1", stored);

    const { result } = orchestrate();
    await act(async () => {
      await result.current.handleRetry("run-1");
    });

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const command = retryCommand();
    // WHY: identity — the stored v1 snapshot stays on the run/command as
    // inert metadata; it must not be copied or re-resolved.
    expect(command.input.dataAccess).toBe(stored);
    expect(command.input.mode).toBe("chat");
    expect(command.input.request).not.toHaveProperty("dataContext");
    expect(command.input.request).toMatchObject({ tools: CHAT_TOOLS });
    expect(readState().runs["run-1"].dataAccess).toBe(stored);
  });

  it("retry of a cards-mode run uses chat tools and does not embed the stored snapshot", async () => {
    seedConversation("conv-1");
    dispatch(["setMode", { mode: "cards" }]);
    dispatch(["setDeck", { deckId: 7 }]);
    const stored: DataAccessSnapshot = {
      context: "User decks:\n- Deck: Old — 1 card — Template: Default (Front, Back)",
      manifest: { decks: [{ deckId: 7, title: "Old", cardCount: 1, templateTitle: "Default" }], writeTarget: null },
    };
    dispatch(["addUserMessage", { runId: "run-1", text: "make cards" }]);
    dispatch(["addAssistantMessage", { runId: "run-1", kind: "generated-cards", text: "" }]);
    dispatch(["startRun", { runId: "run-1", mode: "cards", dataAccess: stored }]);
    dispatch(["runFailed", { runId: "run-1", error: { message: "boom" } }]);

    const { result } = orchestrate();
    await act(async () => {
      await result.current.handleRetry("run-1");
    });

    const command = retryCommand();
    expect(command.input.mode).toBe("chat");
    expect(command.input.dataAccess).toBe(stored);
    expect(command.input.request).toMatchObject({ tools: CHAT_TOOLS });
    expect(command.input.request).not.toHaveProperty("dataContext");
  });

  it("retry of a cards-mode run without a snapshot still sends chat tools", async () => {
    seedConversation("conv-1");
    dispatch(["addUserMessage", { runId: "run-1", text: "make cards" }]);
    dispatch(["addAssistantMessage", { runId: "run-1", kind: "generated-cards", text: "" }]);
    dispatch(["startRun", { runId: "run-1", mode: "cards" }]);
    dispatch(["runFailed", { runId: "run-1", error: { message: "boom" } }]);

    const { result } = orchestrate();
    await act(async () => {
      await result.current.handleRetry("run-1");
    });

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const command = retryCommand();
    expect(command.input.mode).toBe("chat");
    expect(command.input.dataAccess).toBeUndefined();
    expect(command.input.request).not.toHaveProperty("dataContext");
    expect(command.input.request).toMatchObject({ tools: CHAT_TOOLS });
  });

  it("chat retry without a snapshot still sends tools", async () => {
    seedConversation("conv-1");
    addFailedChatRun("run-1");

    const { result } = orchestrate();
    await act(async () => {
      await result.current.handleRetry("run-1");
    });

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const command = retryCommand();
    expect(command.input.dataAccess).toBeUndefined();
    expect(command.input.request).not.toHaveProperty("dataContext");
    expect(command.input.request).toMatchObject({ tools: CHAT_TOOLS });
  });
});

describe("useRunOrchestration — handleRevert", () => {
  let store: ReturnType<typeof createStore>;
  let dispatch: (action: ConversationReducerAction) => void;
  let readState: () => ConversationReducerState;
  let dispatchLocal: ReturnType<typeof vi.fn<(action: ConversationReducerAction) => void>>;

  beforeEach(() => {
    store = createStore();
    dispatch = (action) => store.set(assistantConversationStateAtom, action);
    readState = () => store.get(assistantConversationStateAtom);
    dispatchLocal = vi.fn((action) => store.set(assistantConversationStateAtom, action));
  });

  it("does not change conversation mode when reverting a cards-mode run", () => {
    store.set(upsertConversationAtom, {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date(1),
    });
    store.set(currentConversationIdAtom, "conv-1");
    dispatch(["addUserMessage", { runId: "run-1", text: "make cards" }]);
    dispatch(["addAssistantMessage", { runId: "run-1", kind: "generated-cards", text: "" }]);
    dispatch(["startRun", { runId: "run-1", mode: "cards" }]);
    dispatch(["completeRun", { runId: "run-1" }]);

    const { result } = renderHook(() =>
      useRunOrchestration({
        configRef: { current: makeConfig() },
        readState,
        dispatch,
        dispatchLocal,
        rememberLastUsedAIProfile: vi.fn(),
        cancelActiveRun: vi.fn(),
        dispatchCommand: vi.fn(),
        ensureConversationId: () => "conv-1",
      }),
    );

    let prompt: string | null = null;
    act(() => {
      prompt = result.current.handleRevert(userMessageId("run-1"), "draft");
    });

    expect(prompt).toBe("make cards");
    expect(readState().mode).toBe("chat");
    expect(dispatchLocal.mock.calls.every((call) => call[0][0] !== "setMode")).toBe(true);
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

  it("same-tick double handleGenerate only starts one submit command", async () => {
    seedConversation("conv-1");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const dispatchCommand = vi.fn<DispatchCommand>(async () => {
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
        dispatchCommand,
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

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    expect(dispatchCommand.mock.calls[0]![0]).toMatchObject({ type: "submit" });
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
    const dispatchCommand = vi.fn<DispatchCommand>(async () => {
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
        dispatchCommand,
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
    expect(dispatchCommand).toHaveBeenCalledTimes(1);

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
    expect(dispatchCommand).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await first;
    });

    await act(async () => {
      await result.current.handleGenerate("resubmit-after-clear");
    });

    expect(dispatched.some((a) => a[0] === "commitRevert")).toBe(true);
    expect(readState().revertState).toBeNull();
    expect(dispatchCommand).toHaveBeenCalledTimes(2);
  });

  it("same-tick double handleRetry only starts one retry command", async () => {
    seedConversation("conv-1");
    addFailedChatRun("run-1");

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const dispatchCommand = vi.fn<DispatchCommand>(async () => {
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
        dispatchCommand,
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

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    expect(dispatchCommand.mock.calls[0]![0]).toMatchObject({ type: "retry" });
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
    const dispatchCommand = vi.fn<DispatchCommand>(async (command) => {
      if (command.type === "submit" && command.conversationId === "A") await gateA;
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
        dispatchCommand,
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
    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    expect(dispatchCommand.mock.calls[0]![0]).toMatchObject({ type: "submit", conversationId: "A" });

    store.set(currentConversationIdAtom, "B");

    await act(async () => {
      await result.current.handleGenerate("from B");
    });

    expect(dispatchCommand).toHaveBeenCalledTimes(2);
    expect(dispatchCommand.mock.calls[1]![0]).toMatchObject({ type: "submit", conversationId: "B" });

    await act(async () => {
      releaseA();
      await runA;
    });
  });

  it("swallows AssistantDuplicateRunError from submit command", async () => {
    seedConversation("conv-1");
    const dispatchCommand = vi.fn<DispatchCommand>(async () => {
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
        dispatchCommand,
        ensureConversationId: () => "conv-1",
      }),
    );

    await act(async () => {
      await expect(result.current.handleGenerate("dup")).resolves.toBeUndefined();
    });

    const state = readState();
    expect(state.messages).toHaveLength(0);
    expect(state.runs).toEqual({});
    expect(state.activeRunId).toBeNull();
  });

  it("sync AssistantDuplicateRunError does not dispatch submitTurn", async () => {
    seedConversation("conv-1");
    const dispatchCommand = vi.fn<DispatchCommand>(() => {
      throw new AssistantDuplicateRunError("conv-1", "run-new", "run-old");
    });
    const dispatched: ConversationReducerAction[] = [];
    const trackingDispatch = (action: ConversationReducerAction) => {
      dispatched.push(action);
      dispatch(action);
    };

    const cfg = makeConfig();
    const { result } = renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatch: trackingDispatch,
        dispatchLocal: vi.fn(),
        rememberLastUsedAIProfile: vi.fn(),
        cancelActiveRun: vi.fn(),
        dispatchCommand,
        ensureConversationId: () => "conv-1",
      }),
    );

    await act(async () => {
      await expect(result.current.handleGenerate("dup-sync")).resolves.toBeUndefined();
    });

    expect(dispatched.some((a) => a[0] === "submitTurn")).toBe(false);
    expect(readState().messages).toHaveLength(0);
    expect(readState().activeRunId).toBeNull();
  });

  it("closed-engine submit does not leave a streaming placeholder", async () => {
    seedConversation("conv-1");
    const dispatchCommand = vi.fn<DispatchCommand>(() => {
      throw new AssistantEngineClosedError("closed");
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
        dispatchCommand,
        ensureConversationId: () => "conv-1",
      }),
    );

    await act(async () => {
      await expect(result.current.handleGenerate("closed")).rejects.toMatchObject({
        name: "AssistantEngineClosedError",
      });
    });

    expect(readState().messages).toHaveLength(0);
    expect(readState().runs).toEqual({});
    expect(readState().activeRunId).toBeNull();
  });

  it("swallows AssistantDuplicateRunError from retry command", async () => {
    seedConversation("conv-1");
    addFailedChatRun("run-1");
    const dispatchCommand = vi.fn<DispatchCommand>(async () => {
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
        dispatchCommand,
        ensureConversationId: () => "conv-1",
      }),
    );

    await act(async () => {
      await expect(result.current.handleRetry("run-1")).resolves.toBeUndefined();
    });
  });

  it("rethrows non-duplicate errors from submit command", async () => {
    seedConversation("conv-1");
    const dispatchCommand = vi.fn<DispatchCommand>(async () => {
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
        dispatchCommand,
        ensureConversationId: () => "conv-1",
      }),
    );

    await act(async () => {
      await expect(result.current.handleGenerate("fail")).rejects.toThrow("transport blew up");
    });

    expect(readState().messages).toHaveLength(0);
    expect(readState().runs).toEqual({});
    expect(readState().activeRunId).toBeNull();
  });

  it("rethrows non-duplicate errors from retry command", async () => {
    seedConversation("conv-1");
    addFailedChatRun("run-1");
    const dispatchCommand = vi.fn<DispatchCommand>(async () => {
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
        dispatchCommand,
        ensureConversationId: () => "conv-1",
      }),
    );

    await act(async () => {
      await expect(result.current.handleRetry("run-1")).rejects.toThrow("retry transport blew up");
    });
  });
});
