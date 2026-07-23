import type { AIChatMode, ChatStreamRequest } from "@koloda/ai";
import type { CardGenerationStreamRequest } from "@koloda/ai-react";
import { act, renderHook } from "@testing-library/react";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantConversationConfig } from "./assistant-conversation-config";
import { initialConversationState } from "./conversation-reducer";
import type { ConversationReducerAction, ConversationReducerState } from "./conversation-reducer";
import {
  assistantConversationStateAtom,
  currentConversationIdAtom,
  upsertConversationAtom,
} from "./conversation-store";
import type { TemplateFields } from "@koloda/srs";
import { useRunOrchestration } from "./use-run-orchestration";

// WHY: `handleRetry` had no coverage before this file. The B refactor
// reorders retry from `arm → validate → dispatch` to `validate → arm →
// dispatch` so an invalid retry no longer leaves a pending-run error
// route armed with no stream to clear it. These tests pin that order.

function makeConfig(overrides: Partial<AssistantConversationConfig> = {}): AssistantConversationConfig {
  return {
    profileId: "prof-1",
    modelId: "model-1",
    modelName: "GPT-x",
    temperature: 0.5,
    reasoningEffort: "",
    deckId: 0,
    templateId: 0,
    streamGenerator: vi.fn() as never,
    chatStreamGenerator: vi.fn() as never,
    template: null,
    cardsPromptTemplate: null,
    chatPromptTemplate: null,
    _: ((m: unknown) => m) as never,
    ...overrides,
  };
}

describe("useRunOrchestration — handleRetry ordering (B)", () => {
  let calls: Array<{ fn: string; args: unknown[] }>;
  let armPendingRun: ReturnType<typeof vi.fn>;
  let retryRun: ReturnType<typeof vi.fn>;
  let setGlobalAIProfileState: ReturnType<typeof vi.fn>;
  let dispatchPersisted: (action: ConversationReducerAction) => void;
  let store: ReturnType<typeof createStore>;
  let readState: () => ConversationReducerState;

  beforeEach(() => {
    calls = [];
    armPendingRun = vi.fn((...args: unknown[]) => calls.push({ fn: "arm", args }));
    retryRun = vi.fn(async (...args: unknown[]) => calls.push({ fn: "retryRun", args }));
    setGlobalAIProfileState = vi.fn((...args: unknown[]) => calls.push({ fn: "setGlobalAIProfileState", args }));

    store = createStore();
    dispatchPersisted = (action) => store.set(assistantConversationStateAtom, action);
    readState = () => store.get(assistantConversationStateAtom);
  });

  // Seed a conversation into the test store, make it current, and build its
  // state through the real write path so `readState`/`dispatchPersisted` see
  // the same shape production does.
  function seedConversation(id: string) {
    store.set(upsertConversationAtom, { ...initialConversationState, id, createdAt: new Date(1) });
    store.set(currentConversationIdAtom, id);
  }

  function addChatRun(runId: string, opts: { withUserMessage?: boolean } = {}) {
    const { withUserMessage = true } = opts;
    if (withUserMessage) dispatchPersisted(["addUserMessage", { runId, text: "hello" }]);
    dispatchPersisted(["addAssistantMessage", { runId, kind: "chat-text", text: "" }]);
    dispatchPersisted(["startRun", { runId, mode: "chat", request: {} }]);
  }

  function orchestrate(cfg: AssistantConversationConfig) {
    return renderHook(() =>
      useRunOrchestration({
        configRef: { current: cfg },
        readState,
        dispatchPersisted,
        dispatchEphemeral: vi.fn(),
        setGlobalAIProfileState,
        cancelActiveRun: vi.fn(),
        setMode: vi.fn(),
        executeChatRun: vi.fn(async () => undefined) as never,
        executeGenerateRun: vi.fn(async () => undefined) as never,
        retryRun: retryRun as never,
        ensureConversationId: () => "conv-1",
        armPendingRun: armPendingRun as never,
      }),
    );
  }

  it("an invalid retry (no profile) neither arms the pending ref nor starts a stream", async () => {
    seedConversation("conv-1");
    addChatRun("run-1");
    const cfg = makeConfig({ profileId: "" });

    const { result } = orchestrate(cfg);
    await act(async () => {
      await result.current.handleRetry("run-1");
    });

    const names = calls.map((c) => c.fn);
    expect(names).not.toContain("arm");
    expect(names).not.toContain("retryRun");
    expect(names).not.toContain("setGlobalAIProfileState");
    expect(armPendingRun).not.toHaveBeenCalled();
    expect(retryRun).not.toHaveBeenCalled();
  });

  it("an invalid retry (run missing the user message → empty prompt) neither arms nor starts a stream", async () => {
    seedConversation("conv-1");
    addChatRun("run-2", { withUserMessage: false });
    const cfg = makeConfig();

    const { result } = orchestrate(cfg);
    await act(async () => {
      await result.current.handleRetry("run-2");
    });

    expect(armPendingRun).not.toHaveBeenCalled();
    expect(retryRun).not.toHaveBeenCalled();
  });

  it("a valid chat retry arms after validation, then dispatches retryRun", async () => {
    seedConversation("conv-1");
    addChatRun("run-1");
    const cfg = makeConfig();

    const { result } = orchestrate(cfg);
    await act(async () => {
      await result.current.handleRetry("run-1");
    });

    // WHY: arm must precede retryRun (the ordering the B refactor fixes).
    const order = calls.map((c) => c.fn);
    const armIdx = order.indexOf("arm");
    const retryIdx = order.indexOf("retryRun");
    expect(armIdx).toBeGreaterThanOrEqual(0);
    expect(retryIdx).toBeGreaterThan(armIdx);

    expect(armPendingRun).toHaveBeenCalledTimes(1);
    expect(armPendingRun).toHaveBeenCalledWith("chat", "conv-1", "run-1");

    expect(setGlobalAIProfileState).toHaveBeenCalledWith(cfg);

    expect(retryRun).toHaveBeenCalledTimes(1);
    const [runId, request, templateFields, mode, modelName] = retryRun.mock.calls[0] as [
      string,
      ChatStreamRequest | CardGenerationStreamRequest,
      TemplateFields | null,
      AIChatMode,
      string | undefined,
    ];
    expect(runId).toBe("run-1");
    expect(templateFields).toBeNull();
    expect(mode).toBe("chat");
    expect(modelName).toBe("GPT-x");
    expect(request).toBeTypeOf("object");
  });
});
