import type { ChatStreamRequest, GenerateCardsInput, Message } from "@koloda/ai";
import { generateCardsInputSchema, getTextMessageContent } from "@koloda/ai";
import type { AIChatMode } from "@koloda/ai-react";
import { generateUUID } from "@koloda/app";
import type { TemplateFields } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useCallback } from "react";
import type { RefObject } from "react";
import type { AIProfileStateUpdater } from "./ai-profile-state";
import type { AssistantConversationConfig } from "./assistant-conversation-config";
import { buildConversationMessages, getRunIdFromMessageId, userMessageId } from "./assistant-messages";
import { findLatestErroredRun, getVisibleMessages, resolveRunMode } from "./conversation-reducer";
import type { ConversationReducerAction, ConversationReducerState } from "./conversation-reducer";
import type { CardGenerationStreamRequest } from "./use-assistant-card-generation";

export type StreamRequestResult =
  | { kind: "chat"; request: ChatStreamRequest; templateFields: null }
  | { kind: "cards"; request: CardGenerationStreamRequest; templateFields: TemplateFields | null };

function buildStreamRequest(
  cfg: AssistantConversationConfig,
  mode: AIChatMode,
  promptText: string,
  conversationMessages: Message[],
): StreamRequestResult {
  const input: GenerateCardsInput = generateCardsInputSchema.parse({
    modelId: cfg.modelId,
    prompt: promptText,
    temperature: cfg.temperature,
    reasoningEffort: cfg.reasoningEffort,
    ...(mode === "cards" && cfg.deckId != null ? { deckId: cfg.deckId } : {}),
    ...(mode === "cards" && cfg.templateId != null ? { templateId: cfg.templateId } : {}),
  });

  if (mode === "chat") {
    return {
      kind: "chat",
      request: {
        input,
        messages: [...conversationMessages, { role: "user", content: promptText }],
        template: cfg.template ?? undefined,
        systemPromptTemplate: cfg.chatPromptTemplate ?? undefined,
      },
      templateFields: null,
    };
  }

  return {
    kind: "cards",
    request: {
      input,
      messages: conversationMessages,
      systemPromptTemplate: cfg.cardsPromptTemplate ?? undefined,
    },
    templateFields: cfg.template?.content.fields ?? null,
  };
}

export type UseRunOrchestrationOptions = {
  configRef: RefObject<AssistantConversationConfig>;
  readState: () => ConversationReducerState;
  dispatchAction: (action: ConversationReducerAction) => void;
  // WHY: Revert is visual/in-memory only and must not bump pending save
  // (persist strips revertState). Mode changes still go through setMode.
  dispatchLocal: (action: ConversationReducerAction) => void;
  setGlobalAIProfileState: (updater: AIProfileStateUpdater) => void;
  cancelActiveRun: () => void;
  setMode: (mode: AIChatMode) => void;
  executeChatRun: (conversationId: string, runId: string, request: ChatStreamRequest) => Promise<void>;
  executeGenerateRun: (conversationId: string, runId: string, request: CardGenerationStreamRequest) => Promise<void>;
  retryRun: (
    runId: string,
    request: ChatStreamRequest | CardGenerationStreamRequest,
    templateFields: TemplateFields | null,
    mode: AIChatMode,
    modelName?: string,
  ) => Promise<void>;
  ensureConversationId: () => string | undefined;
  armPendingRun: (mode: AIChatMode, conversationId: string, runId: string) => void;
};

export type UseRunOrchestrationReturn = {
  handleGenerate: (value?: string) => Promise<void>;
  handleRetry: (runId: string) => Promise<void>;
  handleDismissGenerate: () => void;
  /** Returns prompt text for the input, or null when the revert is a no-op. */
  handleRevert: (userMessageId: string, currentInputText: string) => string | null;
  /** Returns the pre-revert input text to restore, or null when nothing to restore. */
  handleRestore: () => string | null;
};

export function useRunOrchestration({
  configRef,
  readState,
  dispatchAction,
  dispatchLocal,
  setGlobalAIProfileState,
  cancelActiveRun,
  setMode,
  executeChatRun,
  executeGenerateRun,
  retryRun,
  ensureConversationId,
  armPendingRun,
}: UseRunOrchestrationOptions): UseRunOrchestrationReturn {
  const handleRetry = useCallback(async (runId: string) => {
    const cfg = configRef.current;
    const currentState = readState();
    const conversationId = currentState.id;
    const mode = resolveRunMode(currentState, runId);
    if (!mode) return;

    armPendingRun(mode, conversationId, runId);

    // WHY: Retry is exposed only on the visible tail. The history sent
    // to the AI must mirror what the user sees, so filter out anything
    // hidden by revert before walking the message list.
    const visibleMessages = getVisibleMessages(currentState.messages, currentState.revertState);
    const userMessage = visibleMessages.find((m) => m.id === userMessageId(runId));
    const promptText = userMessage ? getTextMessageContent(userMessage) : "";
    if (!promptText || !cfg.profileId || !cfg.modelId) return;
    if (mode === "cards" && !cfg.template) return;

    setGlobalAIProfileState(cfg);

    const conversationMessages = buildConversationMessages(visibleMessages, currentState.runs, cfg.template);
    cfg.touchProfileMutate({ id: cfg.profileId, modelId: cfg.modelId });

    const result = buildStreamRequest(cfg, mode, promptText, conversationMessages);
    await retryRun(runId, result.request, result.templateFields, mode, cfg.modelName);
  }, [configRef, retryRun, readState, setGlobalAIProfileState, armPendingRun]);

  const handleDismissGenerate = useCallback(() => {
    const run = findLatestErroredRun(readState());
    if (run) dispatchAction(["dismissRunError", { runId: run.id }]);
  }, [readState, dispatchAction]);

  const handleGenerate = useCallback(async (value?: string) => {
    ensureConversationId();
    const cfg = configRef.current;
    let currentState = readState();

    // WHY: Revert is visual until the user submits a new prompt. Commit
    // it now so the hidden messages and their runs are actually
    // removed; the prompt then becomes the latest user message and
    // starts a fresh run. Re-read the state afterwards so the rest of
    // this handler sees the post-commit shape.
    if (currentState.revertState) {
      dispatchAction(["commitRevert"]);
      currentState = readState();
    }

    const currentMode = currentState.mode;

    const promptText = (value ?? "").trim();
    if (!promptText || !cfg.profileId || !cfg.modelId) return;
    if (currentMode === "cards" && !cfg.template) return;

    const runId = generateUUID();
    // WHY: After ensureConversationId(), the conversation is in the store.
    // Use the state's id rather than the prop (which may be undefined on cold start).
    const activeConversationId = readState().id;
    armPendingRun(currentMode, activeConversationId, runId);

    setGlobalAIProfileState(cfg);

    const conversationMessages = buildConversationMessages(currentState.messages, currentState.runs, cfg.template);
    cfg.touchProfileMutate({ id: cfg.profileId, modelId: cfg.modelId });

    const result = buildStreamRequest(cfg, currentMode, promptText, conversationMessages);

    dispatchAction(["addUserMessage", { runId, text: promptText }]);

    if (result.kind === "chat") {
      dispatchAction([
        "startRun",
        {
          runId,
          mode: "chat",
          request: result.request,
          templateFields: null,
          modelName: cfg.modelName,
        },
      ]);
      dispatchAction(["addAssistantMessage", { runId, kind: "chat-text", text: "" }]);
      await executeChatRun(activeConversationId, runId, result.request);
    } else {
      dispatchAction([
        "startRun",
        {
          runId,
          mode: "cards",
          request: result.request,
          templateFields: result.templateFields,
          modelName: cfg.modelName,
        },
      ]);
      dispatchAction([
        "addAssistantMessage",
        {
          runId,
          kind: "generated-cards",
          text: cfg._(msg`assistant.chat.message.status.pending`),
        },
      ]);
      await executeGenerateRun(activeConversationId, runId, result.request);
    }
  }, [
    configRef,
    ensureConversationId,
    dispatchAction,
    executeChatRun,
    executeGenerateRun,
    readState,
    setGlobalAIProfileState,
    armPendingRun,
  ]);

  const handleRevert = useCallback((userMessageId: string, currentInputText: string) => {
    const state = readState();
    const userMessage = state.messages.find((m) => m.id === userMessageId);
    if (!userMessage) return null;
    const promptText = getTextMessageContent(userMessage);
    if (!promptText) return null;

    // WHY: Revert is visual; the actual deletion happens on the next
    // prompt submit. We just set the in-memory revert state. Any active
    // stream is canceled because its run will be among the hidden
    // messages and must not keep streaming.
    cancelActiveRun();
    dispatchLocal([
      "setRevertState",
      { revertedToUserMessageId: userMessageId, preRevertInputText: currentInputText },
    ]);
    // WHY: Mirror the mode of the target message so the prompt input
    // lines up with what the run was sent in. Use setMode (bumps save)
    // rather than a raw setMode dispatch so the change persists.
    const runId = getRunIdFromMessageId(userMessageId);
    const targetMode = runId ? resolveRunMode(state, runId) : null;
    if (targetMode && targetMode !== state.mode) {
      setMode(targetMode);
    }
    return promptText;
  }, [readState, cancelActiveRun, dispatchLocal, setMode]);

  const handleRestore = useCallback(() => {
    const state = readState();
    if (!state.revertState) return null;
    const text = state.revertState.preRevertInputText;
    dispatchLocal(["setRevertState", null]);
    return text;
  }, [readState, dispatchLocal]);

  return { handleGenerate, handleRetry, handleDismissGenerate, handleRevert, handleRestore };
}
