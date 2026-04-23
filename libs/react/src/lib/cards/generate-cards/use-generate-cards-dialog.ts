import { useAIModels, useAIProfiles } from "@koloda/react";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { AISecrets, Deck, GenerateCardsInput, GeneratedCard, Template } from "@koloda/srs";
import { createAIGenerationClient, GENERATION_TEMPERATURE } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ModelMessage, UIMessage } from "ai";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStreamRequest } from "@koloda/srs";
import {
  createTextMessage,
  getAssistantMetadata,
  getGeneratedCardsMetadata,
  getTextMessageContent,
  serializeGeneratedCards,
  type GenerationMode,
} from "./generate-cards-utility";
import type { GeneratedCardsMessageProps } from "./generated-cards-message";
import { useChatStream } from "./use-chat-stream";
import { useGenerateCards } from "./use-generate-cards";
import type { GenerateCardsRequest, StreamGenerator } from "./use-generate-cards";

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
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [generatedRuns, setGeneratedRuns] = useState<Record<string, GeneratedCard[]>>({});
  const [canceledRuns, setCanceledRuns] = useState<Record<string, boolean>>({});
  const [failedRuns, setFailedRuns] = useState<Record<string, boolean>>({});
  const canceledRunsRef = useRef<Record<string, boolean>>({});
  const chatTextRef = useRef("");
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
    cards,
    isGenerating,
    error: generateError,
    generate,
    clearCards,
    cancel,
  } = useGenerateCards(streamGenerator);

  const {
    isStreaming: isChatStreaming,
    error: chatError,
    stream: streamChat,
    cancel: cancelChat,
  } = useChatStream(chatStreamGenerator);

  const hasContext = messages.length > 0 || isGenerating;

  const resetConversation = useCallback(() => {
    setPrompt("");
    setMode("chat");
    setMessages([]);
    setActiveRunId(null);
    setGeneratedRuns({});
    setCanceledRuns({});
    canceledRunsRef.current = {};
    setFailedRuns({});
    clearCards();
    cancel();
    cancelChat();
  }, [clearCards, cancel, cancelChat]);

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
    const conversationMessages = buildConversationMessages({
      messages,
      template,
      generatedRuns,
      canceledRuns,
      failedRuns,
      activeRunId,
      isGenerating,
    });

    setPrompt("");
    setMessages((prev) => [
      ...prev,
      createTextMessage(`user-${runId}`, "user", promptText),
    ]);

    touchProfileMutation.mutate({ id: profileId, modelId });
    const input = {
      credentialId: profileId,
      modelId,
      prompt: promptText,
      temperature,
      deckId,
      templateId,
    } as GenerateCardsInput;

    if (mode === "chat") {
      chatTextRef.current = "";
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
      };
      const chatSuccess = await streamChat(chatRequest, (chunk) => {
        chatTextRef.current += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === `assistant-${runId}`
              ? { ...m, parts: [{ type: "text" as const, text: chatTextRef.current }] }
              : m
          )
        );
      });

      if (!chatSuccess) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === `assistant-${runId}`
              ? { ...m, parts: [{ type: "text" as const, text: _(msg`generate-cards.chat-error`) }] }
              : m
          )
        );
      }
    } else {
      setActiveRunId(runId);
      setGeneratedRuns((prev) => ({ ...prev, [runId]: [] }));
      setCanceledRuns((prev) => {
        const next = { ...prev, [runId]: false };
        canceledRunsRef.current = next;
        return next;
      });
      setFailedRuns((prev) => ({ ...prev, [runId]: false }));
      clearCards();
      setMessages((prev) => [
        ...prev,
        createTextMessage(`assistant-${runId}`, "assistant", _(msg`generate-cards.generating`), {
          kind: "generated-cards",
          runId,
        }),
      ]);

      const request: GenerateCardsRequest = { input, messages: conversationMessages };
      const isSuccess = await generate(request);

      if (!isSuccess && !canceledRunsRef.current[runId]) {
        setFailedRuns((prev) => ({ ...prev, [runId]: true }));
      }
    }
  }, [
    prompt,
    mode,
    template,
    messages,
    generatedRuns,
    canceledRuns,
    failedRuns,
    activeRunId,
    isGenerating,
    clearCards,
    touchProfileMutation,
    profileId,
    modelId,
    deckId,
    templateId,
    temperature,
    generate,
    streamChat,
    _,
  ]);

  const handleCancel = useCallback(() => {
    if (activeRunId) {
      setCanceledRuns((prev) => {
        const next = { ...prev, [activeRunId]: true };
        canceledRunsRef.current = next;
        return next;
      });
    }
    cancel();
    cancelChat();
  }, [activeRunId, cancel, cancelChat]);

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

  useEffect(() => {
    if (!activeRunId) return;
    setGeneratedRuns((prev) => ({ ...prev, [activeRunId]: cards }));
  }, [activeRunId, cards]);

  useEffect(() => {
    if (mode === "generate" && !isGenerating && activeRunId) {
      setMode("chat");
      setActiveRunId(null);
    }
  }, [mode, isGenerating, activeRunId]);

  const hasProfiles = profiles.length > 0;

  const getGeneratedCardsProps = useCallback((message: UIMessage): GeneratedCardsMessageProps | null => {
    const generatedCardsMetadata = getGeneratedCardsMetadata(message);
    if (!generatedCardsMetadata) return null;

    const runCards = generatedRuns[generatedCardsMetadata.runId] ?? [];
    const isCurrentRun = generatedCardsMetadata.runId === activeRunId;
    const canAdd = runCards.length > 0 && (!isCurrentRun || !isGenerating);

    return {
      cards: runCards,
      template,
      deckId,
      templateId,
      canAdd,
      isGenerating: isCurrentRun && isGenerating,
      isCanceled: !!canceledRuns[generatedCardsMetadata.runId],
    };
  }, [
    generatedRuns,
    canceledRuns,
    activeRunId,
    isGenerating,
    deckId,
    templateId,
    template,
  ]);

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
  };
}

type BuildConversationMessagesOptions = {
  messages: UIMessage[];
  template: Template | null | undefined;
  generatedRuns: Record<string, GeneratedCard[]>;
  canceledRuns: Record<string, boolean>;
  failedRuns: Record<string, boolean>;
  activeRunId: string | null;
  isGenerating: boolean;
};

function buildConversationMessages({
  messages,
  template,
  generatedRuns,
  canceledRuns,
  failedRuns,
  activeRunId,
  isGenerating,
}: BuildConversationMessagesOptions) {
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

    const runCards = generatedRuns[runId] ?? [];
    const isActiveRun = runId === activeRunId;
    if ((isActiveRun && isGenerating) || canceledRuns[runId] || failedRuns[runId] || runCards.length === 0) continue;

    if (!template) continue;
    const cardContent = serializeGeneratedCards(runCards, template);
    if (cardContent) conversation.push({ role: "assistant", content: cardContent });
  }

  return conversation;
}
