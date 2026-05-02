import type { AISecrets, ModelParameter, StreamUsage } from "@koloda/ai";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { Deck, Template } from "@koloda/srs";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";
import type { AIChatCardsMessageProps } from "./ai-chat-cards-message";
import type { AIChatMode } from "./ai-chat-utility";
import { useAIClient } from "./use-ai-client";
import { useAIConfiguration } from "./use-ai-configuration";
import { useConversation } from "./use-conversation";
import type { ConversationConfig } from "./use-conversation";
import { usePromptTemplates } from "./use-prompt-templates";

export type UseAIChatDialogReturn = {
  isOpen: boolean;
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  provider: AISecrets["provider"] | null;
  temperature: number;
  modelParameters: ModelParameter[];
  messages: UIMessage[];
  template: Template | null | undefined;
  hasProfiles: boolean;
  isGenerating: boolean;
  generateError: Error | null;
  mode: AIChatMode;
  setMode: (mode: AIChatMode) => void;
  handleOpenChange: (open: boolean) => void;
  handleProfileChange: (value: string) => void;
  handleModelChange: (value: string) => void;
  handleTemperatureChange: (value: number) => void;
  handleModelParameterChange: (type: ModelParameter["type"], value: string) => void;
  handleGenerate: (value?: string) => Promise<void>;
  handleCancel: () => void;
  handleReset: () => void;
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
  handleRetry: (runId: string) => Promise<void>;
  cardsPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  handleCardsPromptChange: (value: string | null) => void;
  handleChatPromptChange: (value: string | null) => void;
};

export function useAIChatDialog(deckId: Deck["id"], templateId: Template["id"]): UseAIChatDialogReturn {
  const { _ } = useLingui();
  const { getTemplateQuery, touchAIProfileMutation } = useAtomValue(queriesAtom);

  const [isOpen, setIsOpen] = useState(false);

  const {
    profileId,
    modelId,
    modelName,
    models,
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

  const templateQuery = useQuery({ queryKey: queryKeys.templates.detail(templateId), ...getTemplateQuery(templateId) });
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
    deckId,
    templateId,
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

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      handleProfileChange("");
      handleModelChange("");
      handleReset();
    }
  }, [handleProfileChange, handleModelChange, handleReset]);

  return {
    isOpen,
    profileId,
    modelId,
    modelName,
    provider,
    temperature,
    modelParameters,
    messages,
    template,
    hasProfiles,
    isGenerating,
    generateError,
    mode,
    setMode,
    handleOpenChange,
    handleProfileChange,
    handleModelChange,
    handleTemperatureChange,
    handleModelParameterChange,
    handleGenerate,
    handleCancel,
    handleReset,
    getGeneratedCardsProps,
    getChatMessageProps,
    hasContext,
    contextUsage,
    contextLength,
    handleRetry,
    cardsPromptTemplate,
    chatPromptTemplate,
    handleCardsPromptChange,
    handleChatPromptChange,
  };
}
