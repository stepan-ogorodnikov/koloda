import { generateCardsInputSchema } from "@koloda/ai";
import type { ChatStreamGenerator, ChatStreamRequest, StreamUsage } from "@koloda/ai";
import { useChatStream } from "@koloda/ai-react";
import type { AIChatMode } from "@koloda/ai-react";
import type { Deck, Template } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import type { I18nContext } from "@lingui/react";
import type { UIMessage } from "ai";
import { useCallback, useMemo, useReducer, useRef } from "react";
import type { AssistantCardsMessageProps } from "./assistant-cards-message";
import { buildConversationMessages } from "./assistant-messages";
import { conversationReducer, initialConversationState } from "./conversation-state";
import { useAssistantCardGeneration } from "./use-assistant-card-generation";
import type { CardGenerationExecutor, CardGenerationStreamRequest } from "./use-assistant-card-generation";
import { useConversationMessageProps } from "./use-conversation-message-props";
import { useConversationRuns } from "./use-conversation-runs";

export type AssistantConversationConfig = {
  profileId: string;
  modelId: string;
  temperature: number;
  reasoningEffort: string;
  deckId: Deck["id"];
  templateId: Template["id"];
  streamGenerator: CardGenerationExecutor;
  chatStreamGenerator: ChatStreamGenerator;
  template: Template | null | undefined;
  touchProfileMutate: (args: { id: string; modelId: string }) => void;
  cardsPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  _: I18nContext["_"];
};

export type UseAssistantConversationReturn = {
  messages: UIMessage[];
  isGenerating: boolean;
  generateError: Error | null;
  mode: AIChatMode;
  setMode: (mode: AIChatMode) => void;
  hasContext: boolean;
  contextUsage: StreamUsage | null;
  handleGenerate: (value?: string) => Promise<void>;
  handleCancel: () => void;
  handleReset: () => void;
  handleRetry: (runId: string) => Promise<void>;
  getGeneratedCardsProps: (message: UIMessage) => AssistantCardsMessageProps | null;
  getChatMessageProps: (
    message: UIMessage,
  ) =>
    | { isStreaming: true }
    | { isSuccess: true; elapsedSeconds: number }
    | { isCanceled: true; elapsedSeconds: number }
    | { isFailed: true; canRetry: boolean; onRetry: () => void }
    | null;
};

export function useAssistantConversation(config: AssistantConversationConfig): UseAssistantConversationReturn {
  const [state, dispatch] = useReducer(conversationReducer, initialConversationState);
  const configRef = useRef(config);
  configRef.current = config;
  const stateRef = useRef(state);
  stateRef.current = state;

  const {
    isGenerating,
    error: generateError,
    generate,
    cancel: cancelGenerate,
  } = useAssistantCardGeneration(config.streamGenerator);

  const {
    isStreaming: isChatStreaming,
    error: chatError,
    stream: streamChat,
    cancel: cancelChat,
  } = useChatStream(config.chatStreamGenerator);

  const hasContext = state.messages.length > 0 || isGenerating || isChatStreaming;

  const contextUsage = useMemo(() => {
    let promptTokens = 0;
    let completionTokens = 0;
    let hasUsage = false;

    for (const run of Object.values(state.runs)) {
      if (run.usage) {
        hasUsage = true;
        promptTokens += run.usage.promptTokens;
        completionTokens += run.usage.completionTokens;
      }
    }

    if (!hasUsage) return null;

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }, [state.runs]);

  const { executeChatRun, executeGenerateRun, handleRetry } = useConversationRuns(
    streamChat,
    generate,
    dispatch,
    stateRef,
  );

  const { getGeneratedCardsProps, getChatMessageProps } = useConversationMessageProps(
    stateRef,
    configRef,
    handleRetry,
  );

  const handleGenerate = useCallback(
    async (value?: string) => {
      const cfg = configRef.current;
      const currentState = stateRef.current;
      const currentMode = currentState.mode;

      const promptText = (value ?? "").trim();
      if (!promptText || !cfg.profileId || !cfg.modelId) return;
      if (currentMode === "cards" && !cfg.template) return;

      const runId = crypto.randomUUID();
      const conversationMessages = buildConversationMessages(
        currentState.messages,
        currentState.runs,
        cfg.template,
      );

      cfg.touchProfileMutate({ id: cfg.profileId, modelId: cfg.modelId });
      const input = generateCardsInputSchema.parse({
        modelId: cfg.modelId,
        prompt: promptText,
        temperature: cfg.temperature,
        reasoningEffort: cfg.reasoningEffort,
        deckId: cfg.deckId,
        templateId: cfg.templateId,
      });

      dispatch({ type: "addUserMessage", runId, text: promptText });

      if (currentMode === "chat") {
        const chatRequest: ChatStreamRequest = {
          input,
          messages: [...conversationMessages, { role: "user", content: promptText }],
          template: cfg.template ?? undefined,
          systemPromptTemplate: cfg.chatPromptTemplate ?? undefined,
        };
        dispatch({ type: "startRun", runId, mode: "chat", request: chatRequest });
        dispatch({ type: "addAssistantMessage", runId, kind: "chat-text", text: "" });
        await executeChatRun(runId, chatRequest);
      } else {
        const request: CardGenerationStreamRequest = {
          input,
          messages: conversationMessages,
          systemPromptTemplate: cfg.cardsPromptTemplate ?? undefined,
        };
        dispatch({ type: "startRun", runId, mode: "cards", request });
        dispatch({
          type: "addAssistantMessage",
          runId,
          kind: "generated-cards",
          text: cfg._(msg`assistant.chat.message.status.pending`),
        });
        await executeGenerateRun(runId, request);
      }
    },
    [executeChatRun, executeGenerateRun],
  );

  const handleCancel = useCallback(() => {
    const currentActiveRunId = stateRef.current.activeRunId;
    if (currentActiveRunId) dispatch({ type: "cancelRun", runId: currentActiveRunId });
    cancelGenerate();
    cancelChat();
  }, [cancelGenerate, cancelChat]);

  const handleReset = useCallback(() => {
    dispatch({ type: "reset" });
    cancelGenerate();
    cancelChat();
  }, [cancelGenerate, cancelChat]);

  return {
    messages: state.messages,
    isGenerating: isGenerating || isChatStreaming,
    generateError: generateError || chatError,
    mode: state.mode,
    setMode: useCallback(
      (mode: AIChatMode) => dispatch({ type: "setMode", mode }),
      [],
    ),
    hasContext,
    contextUsage,
    handleGenerate,
    handleCancel,
    handleReset,
    handleRetry,
    getGeneratedCardsProps,
    getChatMessageProps,
  };
}
