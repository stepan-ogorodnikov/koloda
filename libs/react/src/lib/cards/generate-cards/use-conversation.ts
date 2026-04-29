import { generateCardsInputSchema } from "@koloda/srs";
import type { ChatStreamGenerator, ChatStreamRequest, Deck, GeneratedCard, Template } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import type { ModelMessage, UIMessage } from "ai";
import { useCallback, useRef, useState } from "react";
import {
  createTextMessage,
  type GenerationMode,
  getAssistantMetadata,
  getChatTextMetadata,
  getGeneratedCardsMetadata,
  getTextMessageContent,
  serializeGeneratedCards,
} from "./generate-cards-utility";
import type { GeneratedCardsMessageProps } from "./generated-cards-message";
import { useChatStream } from "./use-chat-stream";
import { useGenerateCards } from "./use-generate-cards";
import type { GenerateCardsRequest, StreamGenerator } from "./use-generate-cards";
import { useGenerationRuns } from "./use-generation-runs";
import type { StreamResult } from "./use-streaming-request";

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
  _: (msg: any) => string;
};

export type UseConversationReturn = {
  messages: UIMessage[];
  isGenerating: boolean;
  generateError: Error | null;
  mode: GenerationMode;
  setMode: (mode: GenerationMode) => void;
  hasContext: boolean;
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
  const configRef = useRef(config);
  configRef.current = config;
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [mode, setMode] = useState<GenerationMode>("chat");
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const {
    activeRunId,
    runs,
    startRun,
    addCard,
    completeRun,
    failRun,
    cancelRun,
    restartRun,
    reset: resetRuns,
  } = useGenerationRuns();

  const {
    isGenerating,
    error: generateError,
    generate,
    cancel,
  } = useGenerateCards(config.streamGenerator);

  const {
    isStreaming: isChatStreaming,
    error: chatError,
    stream: streamChat,
    cancel: cancelChat,
  } = useChatStream(config.chatStreamGenerator);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const runsRef = useRef(runs);
  runsRef.current = runs;
  const activeRunIdRef = useRef(activeRunId);
  activeRunIdRef.current = activeRunId;

  const hasContext = messages.length > 0 || isGenerating || isChatStreaming;

  const handleStreamResult = useCallback(
    (result: StreamResult, runId: string) => {
      switch (result) {
        case "success":
          completeRun(runId);
          break;
        case "error":
          failRun(runId);
          break;
        case "aborted":
          cancelRun(runId);
          break;
      }
    },
    [completeRun, failRun, cancelRun],
  );

  const executeChatRun = useCallback(
    async (runId: string, request: ChatStreamRequest) => {
      let currentText = "";
      const result = await streamChat(request, (chunk) => {
        currentText += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === `assistant-${runId}`
              ? { ...m, parts: [{ type: "text" as const, text: currentText }] }
              : m
          )
        );
      });

      if (result === "aborted") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === `assistant-${runId}`
              ? { ...m, parts: [{ type: "text" as const, text: currentText }] }
              : m
          )
        );
      }

      handleStreamResult(result, runId);
    },
    [streamChat, handleStreamResult],
  );

  const executeGenerateRun = useCallback(
    async (runId: string, request: GenerateCardsRequest) => {
      const result = await generate(request, (card) => {
        addCard(runId, card);
      });

      handleStreamResult(result, runId);
      if (result === "success") {
        setMode("chat");
      }
    },
    [generate, addCard, handleStreamResult],
  );

  const handleGenerate = useCallback(async (value?: string) => {
    const cfg = configRef.current;
    const currentMode = modeRef.current;

    const promptText = (value ?? "").trim();
    if (!promptText || !cfg.profileId || !cfg.modelId) return;

    if (currentMode === "generate" && !cfg.template) return;

    const runId = `${Date.now()}`;
    const currentMessages = messagesRef.current;
    const currentRuns = runsRef.current;
    const conversationMessages = buildConversationMessages(currentMessages, currentRuns, cfg.template);

    setMessages((prev) => [
      ...prev,
      createTextMessage(`user-${runId}`, "user", promptText),
    ]);

    cfg.touchProfileMutate({ id: cfg.profileId, modelId: cfg.modelId });
    const input = generateCardsInputSchema.parse({
      modelId: cfg.modelId,
      prompt: promptText,
      temperature: cfg.temperature,
      reasoningEffort: cfg.reasoningEffort,
      deckId: cfg.deckId,
      templateId: cfg.templateId,
    });

    if (currentMode === "chat") {
      setMessages((prev) => [
        ...prev,
        createTextMessage(`assistant-${runId}`, "assistant", "", {
          kind: "chat-text",
          runId,
        }),
      ]);

      const chatRequest: ChatStreamRequest = {
        input,
        messages: [...conversationMessages, { role: "user", content: promptText }],
        template: cfg.template ?? undefined,
        systemPromptTemplate: cfg.chatPromptTemplate ?? undefined,
      };
      startRun(runId, "chat", chatRequest);
      await executeChatRun(runId, chatRequest);
    } else {
      const request: GenerateCardsRequest = {
        input,
        messages: conversationMessages,
        systemPromptTemplate: cfg.generationPromptTemplate ?? undefined,
      };
      startRun(runId, "generate", request);
      setMessages((prev) => [
        ...prev,
        createTextMessage(`assistant-${runId}`, "assistant", cfg._(msg`ai.chat.message.status.pending`), {
          kind: "generated-cards",
          runId,
        }),
      ]);
      await executeGenerateRun(runId, request);
    }
  }, [startRun, executeChatRun, executeGenerateRun]);

  const handleRetry = useCallback(async (runId: string) => {
    const currentRuns = runsRef.current;
    const run = currentRuns[runId];
    if (!run?.request) return;

    restartRun(runId);

    if (run.mode === "chat") {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === `assistant-${runId}`
            ? { ...m, parts: [{ type: "text" as const, text: "" }] }
            : m
        )
      );
      await executeChatRun(runId, run.request as ChatStreamRequest);
    } else {
      await executeGenerateRun(runId, run.request as GenerateCardsRequest);
    }
  }, [restartRun, executeChatRun, executeGenerateRun]);

  const handleCancel = useCallback(() => {
    const currentActiveRunId = activeRunIdRef.current;
    if (currentActiveRunId) {
      cancelRun(currentActiveRunId);
    }
    cancel();
    cancelChat();
  }, [cancel, cancelChat, cancelRun]);

  const handleReset = useCallback(() => {
    setMode("chat");
    setMessages([]);
    resetRuns();
    cancel();
    cancelChat();
  }, [resetRuns, cancel, cancelChat]);

  const getGeneratedCardsProps = useCallback(
    (message: UIMessage): GeneratedCardsMessageProps | null => {
      const generatedCardsMetadata = getGeneratedCardsMetadata(message);
      if (!generatedCardsMetadata) return null;

      const currentRuns = runsRef.current;
      const currentActiveRunId = activeRunIdRef.current;
      const currentMessages = messagesRef.current;
      const cfg = configRef.current;

      const run = currentRuns[generatedCardsMetadata.runId];
      const runCards = run?.cards ?? [];
      const isCurrentRun = generatedCardsMetadata.runId === currentActiveRunId;

      const messageIndex = currentMessages.findIndex((m) => m.id === message.id);
      const canRetry = messageIndex < 0 || messageIndex >= currentMessages.length - 1;

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
    (
      message: UIMessage,
    ):
      | { isStreaming: true }
      | { isSuccess: true; elapsedSeconds: number }
      | { isCanceled: true; elapsedSeconds: number }
      | { isFailed: true; canRetry: boolean; onRetry: () => void }
      | null =>
    {
      const chatMetadata = getChatTextMetadata(message);
      if (!chatMetadata) return null;

      const currentRuns = runsRef.current;
      const currentMessages = messagesRef.current;
      const run = currentRuns[chatMetadata.runId];
      if (!run) return null;

      if (run.status === "streaming") {
        return { isStreaming: true };
      }

      if (run.status === "success" && run.elapsedSeconds !== null) {
        return { isSuccess: true, elapsedSeconds: run.elapsedSeconds };
      }

      if (run.status === "canceled" && run.elapsedSeconds !== null) {
        return { isCanceled: true, elapsedSeconds: run.elapsedSeconds };
      }

      if (run.status !== "failed") return null;

      const messageIndex = currentMessages.findIndex((m) => m.id === message.id);
      const canRetry = messageIndex < 0 || messageIndex >= currentMessages.length - 1;

      return {
        isFailed: true,
        canRetry,
        onRetry: () => handleRetry(chatMetadata.runId),
      };
    },
    [handleRetry],
  );

  return {
    messages,
    isGenerating: isGenerating || isChatStreaming,
    generateError: generateError || chatError,
    mode,
    setMode,
    hasContext,
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
  const conversation: ModelMessage[] = [];

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
