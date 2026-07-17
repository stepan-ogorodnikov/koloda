import type { AIChatMode, AISecrets, ModelParameter } from "@koloda/ai";
import type { Template } from "@koloda/srs";
import { useAssistantProfileSelection } from "./use-assistant-profile-selection";
import { useAssistantSession } from "./use-assistant-session";
import { useConversationPersistence } from "./use-conversation-persistence";

export type UseAssistantChatOptions = {
  conversationId: string | undefined;
  onConversationIdChange: (id: string) => void;
};

export type UseAssistantChatReturn = {
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  provider: AISecrets["provider"] | null;
  modelParameters: ModelParameter[];
  template: Template | null | undefined;
  templateId: Template["id"] | undefined;
  hasRequiredSecrets: boolean;
  missingSecretFieldLabels: string[];
  isModelsLoading: boolean;
  isModelsError: boolean;
  contextLength: number;
  isRestoring: boolean;
  loadError: Error | null;
  handleDismissGenerate: () => void;
  handleDismissSave: () => void;
  handleModelProfileChange: (next: { profileId: string; modelId: string }) => void;
  handleModelParameterChange: (type: ModelParameter["type"], value: string) => void;
  handleGenerate: (value?: string) => Promise<void>;
  handleCancel: () => void;
  handleReset: () => void;
  handleRetry: (runId: string) => Promise<void>;
  handleRevert: (userMessageId: string, currentInputText: string) => string | null;
  handleRestore: () => string | null;
  retryLoad: () => Promise<unknown>;
  setMode: (mode: AIChatMode) => void;
};

/** Thin public/test composer over profile, persistence, and session facades. */
export function useAssistantChat({
  conversationId,
  onConversationIdChange,
}: UseAssistantChatOptions): UseAssistantChatReturn {
  const {
    profileId,
    modelId,
    modelName,
    models,
    isModelsLoading,
    isModelsError,
    selectedProfile,
    missingSecretFieldLabels,
    provider,
    modelParameters,
    setGlobalAIProfileState,
    handleModelProfileChange,
    handleModelParameterChange,
  } = useAssistantProfileSelection();

  const { handleDismissSave, isRestoring, loadError, retryLoad } = useConversationPersistence({
    conversationId,
  });

  const {
    template,
    templateId,
    handleGenerate,
    handleCancel,
    handleReset,
    handleRetry,
    handleRevert,
    handleRestore,
    handleDismissGenerate,
    setMode,
  } = useAssistantSession({
    conversationId,
    onConversationIdChange,
    profileId,
    modelId,
    modelName,
    modelParameters,
    selectedProfile,
    setGlobalAIProfileState,
  });

  return {
    profileId,
    modelId,
    modelName,
    provider,
    modelParameters,
    template,
    templateId,
    hasRequiredSecrets: missingSecretFieldLabels.length === 0,
    missingSecretFieldLabels,
    isModelsLoading,
    isModelsError,
    contextLength: models.find((m) => m.id === modelId)?.context_length ?? 0,
    isRestoring,
    loadError,
    handleDismissGenerate,
    handleDismissSave,
    handleModelProfileChange,
    handleModelParameterChange,
    handleGenerate,
    handleCancel,
    handleReset,
    handleRetry,
    handleRevert,
    handleRestore,
    retryLoad,
    setMode,
  };
}
