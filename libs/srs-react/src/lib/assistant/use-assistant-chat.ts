import type { ModelParameter } from "@koloda/ai";
import { generateCardsInputSchema } from "@koloda/ai";
import type { ChatStreamRequest } from "@koloda/ai";
import { useAIProfiles, useChatStream } from "@koloda/ai-react";
import type { AIChatMode } from "@koloda/ai-react";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Deck, Template } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useEffect, useRef } from "react";
import {
  assistantCancelFunctionsAtom,
  assistantConversationStateAtom,
  resetAssistantConversationAtom,
  setAssistantModeAtom,
} from "./assistant-conversation-atoms";
import { buildConversationMessages } from "./assistant-messages";
import { useAssistantCardGeneration } from "./use-assistant-card-generation";
import type { CardGenerationStreamRequest } from "./use-assistant-card-generation";
import { useAssistantClient } from "./use-assistant-client";
import { useAssistantConfiguration } from "./use-assistant-configuration";
import type { AssistantConversationConfig } from "./use-assistant-conversation";
import { useAssistantPromptTemplates } from "./use-assistant-prompt-templates";
import { useConversationRuns } from "./use-conversation-runs";

export type UseAssistantChatReturn = {
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  provider: string | null;
  temperature: number;
  modelParameters: ModelParameter[];
  template: Template | null | undefined;
  hasRequiredSecrets: boolean;
  missingSecretFieldLabels: string[];
  isModelsLoading: boolean;
  isModelsError: boolean;
  generateError: Error | null;
  contextLength: number;
  cardsPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  handleProfileChange: (value: string) => void;
  handleModelChange: (value: string) => void;
  handleTemperatureChange: (value: number) => void;
  handleModelParameterChange: (type: ModelParameter["type"], value: string) => void;
  handleCardsPromptChange: (value: string | null) => void;
  handleChatPromptChange: (value: string | null) => void;
  handleGenerate: (value?: string) => Promise<void>;
  handleCancel: () => void;
  handleReset: () => void;
  handleRetry: (runId: string) => Promise<void>;
  setMode: (mode: AIChatMode) => void;
};

export function useAssistantChat(deckId?: Deck["id"]): UseAssistantChatReturn {
  const { _ } = useLingui();
  const { getDeckQuery, getTemplateQuery, touchAIProfileMutation } = useAtomValue(queriesAtom);
  const setConversationAction = useSetAtom(assistantConversationStateAtom);
  const resetConversation = useSetAtom(resetAssistantConversationAtom);
  const setMode = useSetAtom(setAssistantModeAtom);

  const {
    profileId,
    modelId,
    modelName,
    models,
    isModelsLoading,
    isModelsError,
    selectedProfile,
    provider,
    temperature,
    reasoningEffort,
    modelParameters,
    handleProfileChange,
    handleModelChange,
    handleTemperatureChange,
    handleModelParameterChange,
  } = useAssistantConfiguration();

  const { defaultProfileId, missingSecretFieldLabels } = useAIProfiles(profileId);
  const hasRequiredSecrets = missingSecretFieldLabels.length === 0;

  useEffect(() => {
    if (defaultProfileId && !profileId) {
      handleProfileChange(defaultProfileId);
    }
  }, [defaultProfileId, profileId, handleProfileChange]);

  useEffect(() => {
    if (!deckId) setMode("chat");
  }, [deckId, setMode]);

  const {
    cardsPromptTemplate,
    chatPromptTemplate,
    handleCardsPromptChange,
    handleChatPromptChange,
  } = useAssistantPromptTemplates();

  const deckQuery = useQuery({
    queryKey: queryKeys.decks.detail(deckId!),
    ...getDeckQuery(deckId!),
    enabled: !!deckId,
  });
  const templateId = deckQuery.data?.templateId;

  const templateQuery = useQuery({
    queryKey: queryKeys.templates.detail(templateId!),
    ...getTemplateQuery(templateId!),
    enabled: !!templateId,
  });
  const template = templateQuery.data;

  const touchProfileMutation = useMutation(touchAIProfileMutation());

  const { streamGenerator, chatStreamGenerator } = useAssistantClient({
    selectedProfile,
    template,
  });

  const conversationConfig: AssistantConversationConfig = {
    profileId,
    modelId,
    temperature,
    reasoningEffort,
    deckId: deckId!,
    templateId: templateId!,
    streamGenerator,
    chatStreamGenerator,
    template,
    touchProfileMutate: (args) => touchProfileMutation.mutate(args),
    cardsPromptTemplate,
    chatPromptTemplate,
    _,
  };

  const configRef = useRef(conversationConfig);
  configRef.current = conversationConfig;

  const readState = useAtomCallback((get) => get(assistantConversationStateAtom));

  const { generate, cancel: cancelGenerate, error: cardGenerationError } = useAssistantCardGeneration(streamGenerator);

  const { stream: streamChat, cancel: cancelChat, error: chatStreamError } = useChatStream(chatStreamGenerator);

  const generateError = cardGenerationError || chatStreamError;
  const setCancelFunctions = useSetAtom(assistantCancelFunctionsAtom);

  useEffect(() => {
    setCancelFunctions({ cancelGenerate, cancelChat });
  }, [cancelGenerate, cancelChat, setCancelFunctions]);

  const { executeChatRun, executeGenerateRun, handleRetry: conversationHandleRetry } = useConversationRuns(
    streamChat,
    generate,
    setConversationAction,
    readState,
  );

  const handleRetryRef = useRef<(runId: string) => Promise<void>>(conversationHandleRetry);
  handleRetryRef.current = conversationHandleRetry;

  const stableHandleRetry = useCallback(
    (runId: string) => handleRetryRef.current(runId),
    [],
  );

  const handleGenerate = useCallback(
    async (value?: string) => {
      const cfg = configRef.current;
      const currentState = readState();
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

      setConversationAction({ type: "addUserMessage", runId, text: promptText });

      if (currentMode === "chat") {
        const chatRequest: ChatStreamRequest = {
          input,
          messages: [...conversationMessages, { role: "user", content: promptText }],
          template: cfg.template ?? undefined,
          systemPromptTemplate: cfg.chatPromptTemplate ?? undefined,
        };
        setConversationAction({ type: "startRun", runId, mode: "chat", request: chatRequest });
        setConversationAction({ type: "addAssistantMessage", runId, kind: "chat-text", text: "" });
        await executeChatRun(runId, chatRequest);
      } else {
        const request: CardGenerationStreamRequest = {
          input,
          messages: conversationMessages,
          systemPromptTemplate: cfg.cardsPromptTemplate ?? undefined,
        };
        setConversationAction({ type: "startRun", runId, mode: "cards", request });
        setConversationAction({
          type: "addAssistantMessage",
          runId,
          kind: "generated-cards",
          text: cfg._(msg`assistant.chat.message.status.pending`),
        });
        await executeGenerateRun(runId, request);
      }
    },
    [setConversationAction, executeChatRun, executeGenerateRun, readState],
  );

  const handleCancel = useCallback(() => {
    const currentActiveRunId = readState().activeRunId;
    if (currentActiveRunId) setConversationAction({ type: "cancelRun", runId: currentActiveRunId });
    cancelGenerate();
    cancelChat();
  }, [setConversationAction, cancelGenerate, cancelChat, readState]);

  const handleReset = useCallback(() => {
    resetConversation();
  }, [resetConversation]);

  const contextLength = models.find((m) => m.id === modelId)?.context_length ?? 0;

  return {
    profileId,
    modelId,
    modelName,
    provider,
    temperature,
    modelParameters,
    template,
    hasRequiredSecrets,
    missingSecretFieldLabels,
    isModelsLoading,
    isModelsError,
    generateError,
    contextLength,
    cardsPromptTemplate,
    chatPromptTemplate,
    handleProfileChange,
    handleModelChange,
    handleTemperatureChange,
    handleModelParameterChange,
    handleCardsPromptChange,
    handleChatPromptChange,
    handleGenerate,
    handleCancel,
    handleReset,
    handleRetry: stableHandleRetry,
    setMode,
  };
}
