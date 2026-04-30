import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { Deck, ModelParameter, StreamUsage, Template } from "@koloda/srs";
import type { AISecrets } from "@koloda/srs";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";
import type { GenerationMode } from "./generate-cards-utility";
import type { GeneratedCardsMessageProps } from "./generated-cards-message";
import { useAIClient } from "./use-ai-client";
import { useAIConfiguration } from "./use-ai-configuration";
import { useConversation } from "./use-conversation";
import type { ConversationConfig } from "./use-conversation";
import { usePromptTemplates } from "./use-prompt-templates";

export type UseGenerateCardsDialogReturn = {
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
  mode: GenerationMode;
  setMode: (mode: GenerationMode) => void;
  handleOpenChange: (open: boolean) => void;
  handleProfileChange: (value: string) => void;
  handleModelChange: (value: string) => void;
  handleTemperatureChange: (value: number) => void;
  handleModelParameterChange: (type: ModelParameter["type"], value: string) => void;
  handleGenerate: (value?: string) => Promise<void>;
  handleCancel: () => void;
  handleReset: () => void;
  getGeneratedCardsProps: (message: UIMessage) => GeneratedCardsMessageProps | null;
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
  generationPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  handleGenerationPromptChange: (value: string | null) => void;
  handleChatPromptChange: (value: string | null) => void;
};

export function useGenerateCardsDialog(deckId: Deck["id"], templateId: Template["id"]): UseGenerateCardsDialogReturn {
  const { _ } = useLingui();
  const { getTemplateQuery, touchAIProfileMutation, aiRuntime } = useAtomValue(queriesAtom);

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
    generationPromptTemplate,
    chatPromptTemplate,
    handleGenerationPromptChange,
    handleChatPromptChange,
  } = usePromptTemplates();

  const templateQuery = useQuery({ queryKey: queryKeys.templates.detail(templateId), ...getTemplateQuery(templateId) });
  const template = templateQuery.data;

  const touchProfileMutation = useMutation(touchAIProfileMutation());

  const { streamGenerator, chatStreamGenerator } = useAIClient({
    selectedProfile,
    aiRuntime,
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
    generationPromptTemplate,
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
    generationPromptTemplate,
    chatPromptTemplate,
    handleGenerationPromptChange,
    handleChatPromptChange,
  };
}
