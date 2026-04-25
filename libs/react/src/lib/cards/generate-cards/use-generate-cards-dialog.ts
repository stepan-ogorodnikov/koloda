import { useAIModels, useAIProfiles } from "@koloda/react";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { AISecrets, Deck, GeneratedCard, Template } from "@koloda/srs";
import { createAIGenerationClient, generateCardsInputSchema, GENERATION_TEMPERATURE } from "@koloda/srs";
import type { ChatStreamRequest } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ModelMessage, UIMessage } from "ai";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import {
  createTextMessage,
  type GenerationMode,
  getAssistantMetadata,
  getGeneratedCardsMetadata,
  getTextMessageContent,
  serializeGeneratedCards,
} from "./generate-cards-utility";
import type { GeneratedCardsMessageProps } from "./generated-cards-message";
import { useChatStream } from "./use-chat-stream";
import { useGenerateCards } from "./use-generate-cards";
import type { GenerateCardsRequest, StreamGenerator } from "./use-generate-cards";
import { useGenerationRuns } from "./use-generation-runs";

export type UseGenerateCardsDialogReturn = {
  isOpen: boolean;
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  provider: AISecrets["provider"] | null;
  temperature: number;
  messages: UIMessage[];
  template: Template | null | undefined;
  hasProfiles: boolean;
  isGenerating: boolean;
  generateError: Error | null;
  mode: GenerationMode;
  setMode: (mode: GenerationMode) => void;
  handleOpenChange: (open: boolean) => void;
  handleProfileChange: (value: string) => void;
  handleModelChange: (value: string) => void;
  handleTemperatureChange: (value: number) => void;
  handleGenerate: (value?: string) => Promise<void>;
  handleCancel: () => void;
  handleReset: () => void;
  getGeneratedCardsProps: (message: UIMessage) => GeneratedCardsMessageProps | null;
  hasContext: boolean;
  handleRetry: (runId: string) => Promise<void>;
};

export function useGenerateCardsDialog(deckId: Deck["id"], templateId: Template["id"]): UseGenerateCardsDialogReturn {
  const { _ } = useLingui();
  const { getTemplateQuery, touchAIProfileMutation } = useAtomValue(queriesAtom);
  const [isOpen, setIsOpen] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [modelId, setModelId] = useState("");
  const [temperature, setTemperature] = useState(GENERATION_TEMPERATURE);
  const [mode, setMode] = useState<GenerationMode>("chat");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const { activeRunId, runs, startRun, addCard, completeRun, failRun, cancelRun, restartRun, reset: resetRuns } =
    useGenerationRuns();
  const touchProfileMutation = useMutation(touchAIProfileMutation());
  const templateQuery = useQuery({ queryKey: queryKeys.templates.detail(templateId), ...getTemplateQuery(templateId) });
  const template = templateQuery.data;
  const { profiles, selectedProfile } = useAIProfiles(profileId);
  const { models } = useAIModels(profileId);
  const modelName = models.find((m) => m.id === modelId)?.name;

  const streamGenerator = useCallback<StreamGenerator>(
    async (request, onCard, abortSignal) => {
      if (!selectedProfile) throw new Error("No AI profile selected");
      if (!selectedProfile.secrets) throw new Error("No secrets loaded for AI profile");
      if (!template) throw new Error("No template loaded");

      const client = createAIGenerationClient(selectedProfile.secrets);
      await client.generateCards({
        template,
        input: request.input,
        messages: request.messages,
        onCard,
        abortSignal,
      });
    },
    [selectedProfile, template],
  );

  const chatStreamGenerator = useCallback(
    async (request: ChatStreamRequest, onChunk: (chunk: string) => void, abortSignal: AbortSignal) => {
      if (!selectedProfile) throw new Error("No AI profile selected");
      if (!selectedProfile.secrets) throw new Error("No secrets loaded for AI profile");

      const client = createAIGenerationClient(selectedProfile.secrets);
      await client.chat(request, onChunk, abortSignal);
    },
    [selectedProfile],
  );

  const {
    isGenerating,
    error: generateError,
    generate,
    cancel,
  } = useGenerateCards(streamGenerator);

  const {
    isStreaming: isChatStreaming,
    error: chatError,
    stream: streamChat,
    cancel: cancelChat,
  } = useChatStream(chatStreamGenerator);

  const hasContext = messages.length > 0 || isGenerating || isChatStreaming;

  const resetConversation = useCallback(() => {
    setPrompt("");
    setMode("chat");
    setMessages([]);
    resetRuns();
    cancel();
    cancelChat();
  }, [resetRuns, cancel, cancelChat]);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setProfileId("");
      setModelId("");
      resetConversation();
    }
  }, [resetConversation]);

  const handleReset = useCallback(() => {
    resetConversation();
  }, [resetConversation]);

  const handleProfileChange = useCallback((value: string) => {
    setProfileId(value);
    const profile = profiles.find((p) => p.id === value);
    setModelId(profile?.lastUsedModel ?? "");
  }, [profiles]);

  const handleModelChange = useCallback((value: string) => {
    setModelId(value);
  }, []);

  const handleTemperatureChange = useCallback((value: number) => {
    setTemperature(Number.isNaN(value) ? GENERATION_TEMPERATURE : Math.min(2, Math.max(0, value)));
  }, []);

  const handleGenerate = useCallback(async (value?: string) => {
    let promptText = (value ?? prompt).trim();
    if (!promptText || !profileId || !modelId) return;

    if (mode === "generate" && !template) return;

    const runId = `${Date.now()}`;
    const conversationMessages = buildConversationMessages(messages, runs, template);

    setPrompt("");
    setMessages((prev) => [
      ...prev,
      createTextMessage(`user-${runId}`, "user", promptText),
    ]);

    touchProfileMutation.mutate({ id: profileId, modelId });
    const input = generateCardsInputSchema.parse({
      modelId,
      prompt: promptText,
      temperature,
      deckId,
      templateId,
    });

    if (mode === "chat") {
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
        template: template ?? undefined,
      };
      let currentText = "";
      const result = await streamChat(chatRequest, (chunk) => {
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
              ? {
                ...m,
                parts: [
                  { type: "text" as const, text: currentText },
                  { type: "interrupted" as any, text: _(msg`generate-cards.canceled`) },
                ],
              }
              : m
          )
        );
      }
    } else {
      const request: GenerateCardsRequest = { input, messages: conversationMessages };
      startRun(runId, "generate", request);
      setMessages((prev) => [
        ...prev,
        createTextMessage(`assistant-${runId}`, "assistant", _(msg`generate-cards.generating`), {
          kind: "generated-cards",
          runId,
        }),
      ]);

      const result = await generate(request, (card) => {
        addCard(runId, card);
      });

      if (result === "success") {
        completeRun(runId);
        setMode("chat");
      } else if (result === "error") {
        failRun(runId);
      } else if (result === "aborted") {
        cancelRun(runId);
      }
    }
  }, [
    prompt,
    mode,
    template,
    messages,
    runs,
    profileId,
    modelId,
    temperature,
    deckId,
    templateId,
    touchProfileMutation,
    generate,
    streamChat,
    startRun,
    addCard,
    completeRun,
    failRun,
    cancelRun,
    setMode,
    _,
  ]);

  const handleRetry = useCallback(async (runId: string) => {
    const run = runs[runId];
    if (!run?.request) return;

    restartRun(runId);

    const request = run.request as GenerateCardsRequest;
    const result = await generate(request, (card) => {
      addCard(runId, card);
    });

    if (result === "success") {
      completeRun(runId);
      setMode("chat");
    } else if (result === "error") {
      failRun(runId);
    } else if (result === "aborted") {
      cancelRun(runId);
    }
  }, [runs, generate, restartRun, addCard, completeRun, failRun, cancelRun, setMode]);

  const handleCancel = useCallback(() => {
    if (activeRunId) {
      cancelRun(activeRunId);
    }
    cancel();
    cancelChat();
  }, [activeRunId, cancel, cancelChat, cancelRun]);

  useEffect(() => {
    if (!profileId) {
      setModelId("");
      return;
    }

    if (modelId && models.some((model) => model.id === modelId)) return;

    const profile = profiles.find((item) => item.id === profileId);
    const preferredModelId = profile?.lastUsedModel;
    if (preferredModelId && models.some((model) => model.id === preferredModelId)) {
      setModelId(preferredModelId);
      return;
    }

    setModelId(models[0]?.id ?? "");
  }, [profileId, modelId, models, profiles]);

  const hasProfiles = profiles.length > 0;

  const getGeneratedCardsProps = useCallback((message: UIMessage): GeneratedCardsMessageProps | null => {
    const generatedCardsMetadata = getGeneratedCardsMetadata(message);
    if (!generatedCardsMetadata) return null;

    const run = runs[generatedCardsMetadata.runId];
    const runCards = run?.cards ?? [];
    const isCurrentRun = generatedCardsMetadata.runId === activeRunId;
    const isRunGenerating = isCurrentRun && isGenerating;

    return {
      cards: runCards,
      template,
      deckId,
      templateId,
      canAdd: runCards.length > 0 && !isRunGenerating,
      isGenerating: isRunGenerating,
      isCanceled: run?.status === "canceled",
      isFailed: run?.status === "failed",
      onRetry: () => handleRetry(generatedCardsMetadata.runId),
    };
  }, [runs, activeRunId, isGenerating, deckId, templateId, template, handleRetry]);

  return {
    isOpen,
    profileId,
    modelId,
    modelName,
    provider: selectedProfile?.secrets?.provider ?? null,
    temperature,
    messages,
    template,
    hasProfiles,
    isGenerating: isGenerating || isChatStreaming,
    generateError: generateError || chatError,
    mode,
    setMode,
    handleOpenChange,
    handleProfileChange,
    handleModelChange,
    handleTemperatureChange,
    handleGenerate,
    handleCancel,
    handleReset,
    getGeneratedCardsProps,
    hasContext,
    handleRetry,
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
