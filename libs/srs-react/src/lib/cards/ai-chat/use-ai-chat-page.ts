import type { ModelParameter, StreamUsage } from "@koloda/ai";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Deck, Template } from "@koloda/srs";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import type { AIChatCardsMessageProps } from "./ai-chat-cards-message";
import type { AIChatMode } from "./ai-chat-utility";
import { useAIClient } from "./use-ai-client";
import { useAIConfiguration } from "./use-ai-configuration";
import { useConversation } from "./use-conversation";
import type { ConversationConfig } from "./use-conversation";
import { usePromptTemplates } from "./use-prompt-templates";

export type UseAIChatPageReturn = {
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  provider: string | null;
  temperature: number;
  modelParameters: ModelParameter[];
  messages: UIMessage[];
  template: Template | null | undefined;
  hasProfiles: boolean;
  isModelsLoading: boolean;
  isModelsError: boolean;
  isGenerating: boolean;
  generateError: Error | null;
  mode: AIChatMode;
  setMode: (mode: AIChatMode) => void;
  handleProfileChange: (value: string) => void;
  handleModelChange: (value: string) => void;
  handleTemperatureChange: (value: number) => void;
  handleModelParameterChange: (type: ModelParameter["type"], value: string) => void;
  handleGenerate: (value?: string) => Promise<void>;
  handleCancel: () => void;
  handleReset: () => void;
  handleRetry: (runId: string) => Promise<void>;
  getGeneratedCardsProps: (message: UIMessage) => AIChatCardsMessageProps | null;
  getChatMessageProps: (
    message: UIMessage,
  ) =>
    | { isStreaming: true }
    | { isSuccess: true; elapsedSeconds: number }
    | { isCanceled: true; elapsedSeconds: number }
    | { isFailed: true; canRetry: boolean; onRetry: () => void }
    | null;
  hasContext: boolean;
  contextUsage: StreamUsage | null;
  contextLength: number;
  cardsPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  handleCardsPromptChange: (value: string | null) => void;
  handleChatPromptChange: (value: string | null) => void;
};

export function useAIChatPage(deckId?: Deck["id"], templateId?: Template["id"]): UseAIChatPageReturn {
  const { _ } = useLingui();
  const { getTemplateQuery, touchAIProfileMutation } = useAtomValue(queriesAtom);

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
    hasProfiles,
    handleProfileChange,
    handleModelChange,
    handleTemperatureChange,
    handleModelParameterChange,
  } = useAIConfiguration();

  const {
    cardsPromptTemplate,
    chatPromptTemplate,
    handleCardsPromptChange,
    handleChatPromptChange,
  } = usePromptTemplates();

  const templateQuery = useQuery({
    queryKey: queryKeys.templates.detail(templateId!),
    ...getTemplateQuery(templateId!),
    enabled: !!templateId,
  });
  const template = templateQuery.data;

  const touchProfileMutation = useMutation(touchAIProfileMutation());

  const { streamGenerator, chatStreamGenerator } = useAIClient({
    selectedProfile,
    template,
  });

  const conversationConfig: ConversationConfig = {
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

  const {
    messages,
    isGenerating,
    generateError,
    mode,
    setMode,
    hasContext,
    contextUsage,
    handleGenerate,
    handleCancel,
    handleReset,
    handleRetry,
    getGeneratedCardsProps,
    getChatMessageProps,
  } = useConversation(conversationConfig);

  const contextLength = models.find((m) => m.id === modelId)?.context_length ?? 0;

  useEffect(() => {
    return () => {
      handleProfileChange("");
      handleModelChange("");
      handleReset();
    };
  }, [handleProfileChange, handleModelChange, handleReset]);

  return {
    profileId,
    modelId,
    modelName,
    provider,
    temperature,
    modelParameters,
    messages,
    template,
    hasProfiles,
    isModelsLoading,
    isModelsError,
    isGenerating,
    generateError,
    mode,
    setMode,
    handleProfileChange,
    handleModelChange,
    handleTemperatureChange,
    handleModelParameterChange,
    handleGenerate,
    handleCancel,
    handleReset,
    handleRetry,
    getGeneratedCardsProps,
    getChatMessageProps,
    hasContext,
    contextUsage,
    contextLength,
    cardsPromptTemplate,
    chatPromptTemplate,
    handleCardsPromptChange,
    handleChatPromptChange,
  };
}
