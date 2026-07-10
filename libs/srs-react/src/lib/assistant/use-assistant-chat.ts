import type { AISecrets, ModelParameter } from "@koloda/ai";
import type { AIChatMode } from "@koloda/ai-react";
import { generateUUID } from "@koloda/app";
import type { Template } from "@koloda/srs";
import { useSetAtom, useStore } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useRef } from "react";
import { aiProfileStateAtom } from "./ai-profile-state";
import {
  assistantConversationStateAtom,
  bumpPendingSaveAtom,
  dispatchToConversationOnStore,
  newConversationAtom,
  setAssistantModeAtom,
} from "./assistant-conversation-atoms";
import type { ConversationReducerAction } from "./conversation-reducer";
import { useAssistantProfileSelection } from "./use-assistant-profile-selection";
import { useAssistantRuntimeConfig } from "./use-assistant-runtime-config";
import { useAssistantStreamSetup } from "./use-assistant-stream-setup";
import { useConversationPersistence } from "./use-conversation-persistence";
import { useRunOrchestration } from "./use-run-orchestration";

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
  handleProfileChange: (value: string) => void;
  handleModelChange: (value: string) => void;
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

export function useAssistantChat(
  { conversationId, onConversationIdChange }: UseAssistantChatOptions,
): UseAssistantChatReturn {
  const setConversationReducerAction = useSetAtom(assistantConversationStateAtom);
  const setMode = useSetAtom(setAssistantModeAtom);
  const bumpPendingSave = useSetAtom(bumpPendingSaveAtom);
  const newConversation = useSetAtom(newConversationAtom);

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
    handleProfileChange,
    handleModelChange,
    handleModelProfileChange,
    handleModelParameterChange,
  } = useAssistantProfileSelection();
  const reasoningEffort = modelParameters.find((p) => p.type === "reasoning_effort")?.value ?? "";
  const hasRequiredSecrets = missingSecretFieldLabels.length === 0;

  const assistantConfig = useAssistantRuntimeConfig({
    profileId,
    modelId,
    modelName,
    reasoningEffort,
    selectedProfile,
  });
  const { template, templateId, configRef } = assistantConfig;

  const readState = useAtomCallback((get) => get(assistantConversationStateAtom));
  const readLastUsed = useAtomCallback((get) => get(aiProfileStateAtom));
  const store = useStore();

  const dispatchAction = useCallback((action: ConversationReducerAction) => {
    setConversationReducerAction(action);
    bumpPendingSave();
  }, [setConversationReducerAction, bumpPendingSave]);

  const dispatchFor = useCallback((id: string, action: ConversationReducerAction) => {
    dispatchToConversationOnStore(store, id, action);
  }, [store]);

  const { armPendingRun, executeChatRun, executeGenerateRun, retryRun, cancel } = useAssistantStreamSetup({
    streamGenerator: configRef.current.streamGenerator,
    chatStreamGenerator: configRef.current.chatStreamGenerator,
    dispatchAction,
    dispatchFor,
    readState,
    bumpPendingSave,
  });

  const handleCancel = useCallback(() => {
    const currentActiveRunId = readState().activeRunId;
    if (currentActiveRunId) dispatchAction(["cancelRun", { runId: currentActiveRunId }]);
    cancel();
  }, [dispatchAction, cancel, readState]);

  const handleReset = useCallback(() => {
    const stored = readLastUsed();
    const newId = newConversation(stored ?? undefined);
    onConversationIdChange(newId);
  }, [newConversation, onConversationIdChange, readLastUsed]);

  // WHY: On cold start, conversationId is undefined until the URL catches up.
  // We hold the locally-assigned id here so ensureConversationId can return
  // it synchronously before the router navigates.
  const localConversationIdRef = useRef<string | null>(conversationId ?? null);

  const { handleDismissSave, isRestoring, loadError, retryLoad } = useConversationPersistence({ conversationId });

  const ensureConversationId = useCallback(() => {
    if (conversationId) return conversationId;
    if (!localConversationIdRef.current) {
      const id = generateUUID();
      localConversationIdRef.current = id;
      const stored = readLastUsed();
      dispatchAction([
        "newConversation",
        { ...stored, id, createdAt: new Date() },
      ]);
      onConversationIdChange(id);
    }
    return localConversationIdRef.current;
  }, [conversationId, onConversationIdChange, dispatchAction, readLastUsed]);

  const { handleGenerate, handleRetry, handleDismissGenerate, handleRevert, handleRestore } = useRunOrchestration({
    configRef,
    readState,
    dispatchAction,
    dispatchLocal: setConversationReducerAction,
    setGlobalAIProfileState,
    cancelActiveRun: handleCancel,
    setMode,
    executeChatRun,
    executeGenerateRun,
    retryRun,
    ensureConversationId,
    armPendingRun,
  });

  return {
    profileId,
    modelId,
    modelName,
    provider,
    modelParameters,
    template,
    templateId,
    hasRequiredSecrets,
    missingSecretFieldLabels,
    isModelsLoading,
    isModelsError,
    contextLength: models.find((m) => m.id === modelId)?.context_length ?? 0,
    isRestoring,
    loadError,
    handleDismissGenerate,
    handleDismissSave,
    handleProfileChange,
    handleModelChange,
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
