import type { ChatStreamRequest, GenerateCardsInput, Message } from "@koloda/ai";
import { generateCardsInputSchema, getTextMessageContent } from "@koloda/ai";
import type { AIChatMode } from "@koloda/ai-react";
import { generateUUID } from "@koloda/app";
import type { TemplateFields } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useCallback } from "react";
import type { RefObject } from "react";
import type { AIProfileStateUpdater } from "./ai-profile-state";
import { buildConversationMessages, getAssistantMetadata } from "./assistant-messages";
import type { ConversationAction, ConversationState } from "./conversation-state";
import type { CardGenerationStreamRequest } from "./use-assistant-card-generation";
import type { AssistantConversationConfig } from "./use-assistant-conversation";

/**
 * Discriminated union for the two kinds of stream requests.
 * The caller destructures `kind` to decide which executor to use.
 */
export type StreamRequestResult =
  | { kind: "chat"; request: ChatStreamRequest; templateFields: null }
  | { kind: "cards"; request: CardGenerationStreamRequest; templateFields: TemplateFields | null };

/**
 * Build the stream request (chat or cards) from the current config, mode,
 * prompt text, and conversation history. This is the single source of
 * truth for request construction, used by both `handleGenerate` and
 * `handleRetry`.
 */
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
  readState: () => ConversationState;
  dispatchAction: (action: ConversationAction) => void;
  setGlobalAIProfileState: (updater: AIProfileStateUpdater) => void;
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
};

export function useRunOrchestration({
  configRef,
  readState,
  dispatchAction,
  setGlobalAIProfileState,
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
    const run = currentState.runs[runId];
    let mode: AIChatMode | undefined = run?.mode;
    if (!mode) {
      const assistantMessage = currentState.messages.find((m) => m.id === `assistant-${runId}`);
      const metadata = assistantMessage ? getAssistantMetadata(assistantMessage) : null;
      if (metadata?.kind === "error") mode = metadata.mode;
      if (!mode) return;
    }

    // Arm the per-stream failure ref *before* the retry stream starts so
    // that an error during the retry is routed to the right conversation
    // and run. The execute function clears it on completion.
    armPendingRun(mode, conversationId, runId);

    const userMessage = currentState.messages.find((m) => m.id === `user-${runId}`);
    const promptText = userMessage ? getTextMessageContent(userMessage) : "";
    if (!promptText || !cfg.profileId || !cfg.modelId) return;
    if (mode === "cards" && !cfg.template) return;

    setGlobalAIProfileState(cfg);

    const conversationMessages = buildConversationMessages(currentState.messages, currentState.runs, cfg.template);
    cfg.touchProfileMutate({ id: cfg.profileId, modelId: cfg.modelId });

    const result = buildStreamRequest(cfg, mode, promptText, conversationMessages);
    await retryRun(runId, result.request, result.templateFields, mode, cfg.modelName);
    // The execute function's `finally` clears the failure ref now that the
    // stream has ended. No re-arm needed.
  }, [configRef, retryRun, readState, setGlobalAIProfileState, armPendingRun]);

  const handleDismissGenerate = useCallback(() => {
    const state = readState();
    const ids = Object.keys(state.runs);
    for (let i = ids.length - 1; i >= 0; i--) {
      const run = state.runs[ids[i]];
      if (run.status === "failed") {
        dispatchAction({ type: "dismissRunError", runId: run.id });
        return;
      }
    }
  }, [readState, dispatchAction]);

  const handleGenerate = useCallback(async (value?: string) => {
    ensureConversationId();
    const cfg = configRef.current;
    const currentState = readState();
    const currentMode = currentState.mode;

    const promptText = (value ?? "").trim();
    if (!promptText || !cfg.profileId || !cfg.modelId) return;
    if (currentMode === "cards" && !cfg.template) return;

    const runId = generateUUID();
    // After ensureConversationId(), the conversation is in the store.
    // Use the state's id rather than the prop (which may be undefined on cold start).
    const activeConversationId = readState().id;
    // Arm the per-stream failure ref so an error during this run routes
    // back to the originating conversation. The execute function's
    // `finally` clears it on completion.
    armPendingRun(currentMode, activeConversationId, runId);

    setGlobalAIProfileState(cfg);

    const conversationMessages = buildConversationMessages(currentState.messages, currentState.runs, cfg.template);
    cfg.touchProfileMutate({ id: cfg.profileId, modelId: cfg.modelId });

    const result = buildStreamRequest(cfg, currentMode, promptText, conversationMessages);

    dispatchAction({ type: "addUserMessage", runId, text: promptText });

    if (result.kind === "chat") {
      dispatchAction({
        type: "startRun",
        runId,
        mode: "chat",
        request: result.request,
        templateFields: null,
        modelName: cfg.modelName,
      });
      dispatchAction({ type: "addAssistantMessage", runId, kind: "chat-text", text: "" });
      await executeChatRun(activeConversationId, runId, result.request);
    } else {
      dispatchAction({
        type: "startRun",
        runId,
        mode: "cards",
        request: result.request,
        templateFields: result.templateFields,
        modelName: cfg.modelName,
      });
      dispatchAction({
        type: "addAssistantMessage",
        runId,
        kind: "generated-cards",
        text: cfg._(msg`assistant.chat.message.status.pending`),
      });
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

  return { handleGenerate, handleRetry, handleDismissGenerate };
}
