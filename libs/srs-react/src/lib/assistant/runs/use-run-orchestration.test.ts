import type { AIChatMode, ChatStreamRequest } from "@koloda/ai";
import type { CardGenerationStreamRequest } from "@koloda/ai-react";
import type { TemplateFields } from "@koloda/srs";
import { act, renderHook } from "@testing-library/react";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantConversationConfig } from "../state/assistant-conversation-config";
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
