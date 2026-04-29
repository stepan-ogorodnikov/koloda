import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { Deck, ModelParameter, Template } from "@koloda/srs";
import { createAIGenerationClient } from "@koloda/srs";
import type { AISecrets, ChatStreamRequest } from "@koloda/srs";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";
import type { GenerationMode } from "./generate-cards-utility";
import type { GeneratedCardsMessageProps } from "./generated-cards-message";
import { useAIConfiguration } from "./use-ai-configuration";
import { useConversation } from "./use-conversation";
import type { ConversationConfig } from "./use-conversation";
import type { StreamGenerator } from "./use-generate-cards";
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

  const streamGenerator = useCallback<StreamGenerator>(
    async (request, onCard, abortSignal) => {
      if (!selectedProfile) throw new Error("No AI profile selected");
      if (!selectedProfile.secrets) throw new Error("No secrets loaded for AI profile");
      if (!template) throw new Error("No template loaded");

      if (selectedProfile.secrets.provider === "codex") {
        if (!aiRuntime?.generateCards) throw new Error("Codex provider requires the native app runtime.");
        await aiRuntime.generateCards(
          {
            input: request.input,
            messages: request.messages,
            template,
            systemPromptTemplate: request.systemPromptTemplate,
          },
          onCard,
          abortSignal,
        );
        return;
      }

      const client = createAIGenerationClient(selectedProfile.secrets);
      await client.generateCards({
        template,
        input: request.input,
        messages: request.messages,
        onCard,
        abortSignal,
        systemPromptTemplate: request.systemPromptTemplate,
      });
    },
    [aiRuntime, selectedProfile, template],
  );

  const chatStreamGenerator = useCallback(
    async (request: ChatStreamRequest, onChunk: (chunk: string) => void, abortSignal: AbortSignal) => {
      if (!selectedProfile) throw new Error("No AI profile selected");
      if (!selectedProfile.secrets) throw new Error("No secrets loaded for AI profile");

      if (selectedProfile.secrets.provider === "codex") {
        if (!aiRuntime?.chat) throw new Error("Codex provider requires the native app runtime.");
        await aiRuntime.chat(request, onChunk, abortSignal);
        return;
      }

      const client = createAIGenerationClient(selectedProfile.secrets);
      await client.chat(request, onChunk, abortSignal);
    },
    [aiRuntime, selectedProfile],
  );

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
    handleGenerate,
    handleCancel,
    handleReset,
    handleRetry,
    getGeneratedCardsProps,
    getChatMessageProps,
  } = useConversation(conversationConfig);

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
    handleRetry,
    generationPromptTemplate,
    chatPromptTemplate,
    handleGenerationPromptChange,
    handleChatPromptChange,
  };
}
