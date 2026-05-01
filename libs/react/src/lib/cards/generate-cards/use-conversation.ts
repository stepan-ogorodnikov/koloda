import { generateCardsInputSchema } from "@koloda/ai";
import type { Message } from "@koloda/ai";
import type { ChatStreamGenerator, ChatStreamRequest, GeneratedCard, StreamUsage } from "@koloda/ai";
import { useChatStream } from "@koloda/ai-react";
import type { StreamResult } from "@koloda/ai-react";
import type { Deck, Template } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import type { I18nContext } from "@lingui/react";
import type { UIMessage } from "ai";
import { useCallback, useMemo, useReducer, useRef } from "react";
import { conversationReducer, initialConversationState } from "./conversation-state";
import type { GenerationMode } from "./generate-cards-utility";
import {
  getAssistantMetadata,
  getChatTextMetadata,
  getGeneratedCardsMetadata,
  getTextMessageContent,
  serializeGeneratedCards,
} from "./generate-cards-utility";
import type { GeneratedCardsMessageProps } from "./generated-cards-message";
import { useGenerateCards } from "./use-generate-cards";
import type { GenerateCardsRequest, StreamGenerator } from "./use-generate-cards";

export type ConversationConfig = {
  profileId: string;
  modelId: string;
  temperature: number;
  reasoningEffort: string;
  deckId: Deck["id"];
  templateId: Template["id"];
  streamGenerator: StreamGenerator;
  chatStreamGenerator: ChatStreamGenerator;
  template: Template | null | undefined;
  touchProfileMutate: (args: { id: string; modelId: string }) => void;
  generationPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  _: I18nContext["_"];
};

export type UseConversationReturn = {
  messages: UIMessage[];
  isGenerating: boolean;
  generateError: Error | null;
  mode: GenerationMode;
  setMode: (mode: GenerationMode) => void;
  hasContext: boolean;
  contextUsage: StreamUsage | null;
  handleGenerate: (value?: string) => Promise<void>;
  handleCancel: () => void;
  handleReset: () => void;
  handleRetry: (runId: string) => Promise<void>;
  getGeneratedCardsProps: (message: UIMessage) => GeneratedCardsMessageProps | null;
  getChatMessageProps: (
    message: UIMessage,
  ) =>
    | { isStreaming: true }
    | { isSuccess: true; elapsedSeconds: number }
    | { isCanceled: true; elapsedSeconds: number }
    | { isFailed: true; canRetry: boolean; onRetry: () => void }
    | null;
};

export function useConversation(config: ConversationConfig): UseConversationReturn {
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
  } = useGenerateCards(config.streamGenerator);

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

  const handleStreamResult = useCallback(
    (result: StreamResult, runId: string) => {
      switch (result) {
        case "success":
          dispatch({ type: "completeRun", runId });
          break;
        case "error":
          dispatch({ type: "failRun", runId });
          break;
        case "aborted":
          dispatch({ type: "cancelRun", runId });
          break;
      }
    },
    [],
  );

  const executeChatRun = useCallback(
    async (runId: string, request: ChatStreamRequest) => {
      let currentText = "";
      const { streamResult, usage } = await streamChat(request, (chunk) => {
        currentText += chunk;
        dispatch({ type: "updateAssistantText", runId, text: currentText });
      });

      if (streamResult === "aborted") dispatch({ type: "updateAssistantText", runId, text: currentText });

      if (usage) dispatch({ type: "setUsage", runId, usage });

      handleStreamResult(streamResult, runId);
    },
    [streamChat, handleStreamResult],
  );

  const executeGenerateRun = useCallback(
    async (runId: string, request: GenerateCardsRequest) => {
      const result = await generate(request, (card) => {
        dispatch({ type: "addCard", runId, card });
      });

      handleStreamResult(result, runId);
      if (result === "success") dispatch({ type: "setMode", mode: "chat" });
    },
    [generate, handleStreamResult],
  );

  const handleGenerate = useCallback(
    async (value?: string) => {
      const cfg = configRef.current;
      const currentState = stateRef.current;
      const currentMode = currentState.mode;

      const promptText = (value ?? "").trim();
      if (!promptText || !cfg.profileId || !cfg.modelId) return;
      if (currentMode === "generate" && !cfg.template) return;

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
        const request: GenerateCardsRequest = {
          input,
          messages: conversationMessages,
          systemPromptTemplate: cfg.generationPromptTemplate ?? undefined,
        };
        dispatch({ type: "startRun", runId, mode: "generate", request });
        dispatch({
          type: "addAssistantMessage",
          runId,
          kind: "generated-cards",
          text: cfg._(msg`ai.chat.message.status.pending`),
        });
        await executeGenerateRun(runId, request);
      }
    },
    [executeChatRun, executeGenerateRun],
  );

  const handleRetry = useCallback(
    async (runId: string) => {
      const currentRuns = stateRef.current.runs;
      const run = currentRuns[runId];
      if (!run?.request) return;

      dispatch({ type: "restartRun", runId });

      if (run.mode === "chat") {
        dispatch({ type: "updateAssistantText", runId, text: "" });
        await executeChatRun(runId, run.request as ChatStreamRequest);
      } else {
        await executeGenerateRun(runId, run.request as GenerateCardsRequest);
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

  const getGeneratedCardsProps = useCallback(
    (message: UIMessage): GeneratedCardsMessageProps | null => {
      const generatedCardsMetadata = getGeneratedCardsMetadata(message);
      if (!generatedCardsMetadata) return null;

      const currentState = stateRef.current;
      const cfg = configRef.current;
      const run = currentState.runs[generatedCardsMetadata.runId];
      const runCards = run?.cards ?? [];
      const isCurrentRun = generatedCardsMetadata.runId === currentState.activeRunId;

      const messageIndex = currentState.messages.findIndex((m) => m.id === message.id);
      const canRetry = messageIndex >= currentState.messages.length - 1;

      return {
        cards: runCards,
        template: cfg.template,
        deckId: cfg.deckId,
        templateId: cfg.templateId,
        canAdd: runCards.length > 0 && !isCurrentRun,
        isGenerating: isCurrentRun,
        isCanceled: run?.status === "canceled",
        isFailed: run?.status === "failed",
        canRetry,
        onRetry: () => handleRetry(generatedCardsMetadata.runId),
        elapsedSeconds: run?.elapsedSeconds ?? undefined,
      };
    },
    [handleRetry],
  );

  const getChatMessageProps = useCallback(
    (message: UIMessage):
      | { isStreaming: true }
      | { isSuccess: true; elapsedSeconds: number }
      | { isCanceled: true; elapsedSeconds: number }
      | { isFailed: true; canRetry: boolean; onRetry: () => void }
      | null =>
    {
      const chatMetadata = getChatTextMetadata(message);
      if (!chatMetadata) return null;

      const currentState = stateRef.current;
      const run = currentState.runs[chatMetadata.runId];

      if (!run) return null;

      if (run.status === "streaming") return { isStreaming: true };

      if (run.status === "success" && run.elapsedSeconds !== null) {
        return { isSuccess: true, elapsedSeconds: run.elapsedSeconds };
      }

      if (run.status === "canceled" && run.elapsedSeconds !== null) {
        return { isCanceled: true, elapsedSeconds: run.elapsedSeconds };
      }

      if (run.status !== "failed") return null;

      const messageIndex = currentState.messages.findIndex((m) => m.id === message.id);
      const canRetry = messageIndex >= currentState.messages.length - 1;

      return {
        isFailed: true,
        canRetry,
        onRetry: () => handleRetry(chatMetadata.runId),
      };
    },
    [handleRetry],
  );

  return {
    messages: state.messages,
    isGenerating: isGenerating || isChatStreaming,
    generateError: generateError || chatError,
    mode: state.mode,
    setMode: useCallback(
      (mode: GenerationMode) => dispatch({ type: "setMode", mode }),
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

function buildConversationMessages(
  messages: UIMessage[],
  runs: Record<string, { status: string; cards: GeneratedCard[] }>,
  template: Template | null | undefined,
) {
  const conversation: Message[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      const content = getTextMessageContent(message);
      if (content) conversation.push({ role: "user", content });
      continue;
    }

    if (message.role !== "assistant") continue;

    const metadata = getAssistantMetadata(message);
    if (!metadata) continue;

    const { runId } = metadata;
    const textContent = getTextMessageContent(message);

    if (metadata.kind === "chat-text") {
      if (textContent) conversation.push({ role: "assistant", content: textContent });
      continue;
    }

    const run = runs[runId];
    if (!run || run.status !== "success" || run.cards.length === 0) continue;

    if (!template) continue;
    const cardContent = serializeGeneratedCards(run.cards, template);
    if (cardContent) conversation.push({ role: "assistant", content: cardContent });
  }

  return conversation;
}
