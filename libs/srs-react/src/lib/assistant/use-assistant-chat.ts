import type { AISecrets, ModelParameter } from "@koloda/ai";
import { useAIProfiles } from "@koloda/ai-react";
import type { AIChatMode } from "@koloda/ai-react";
import { generateUUID } from "@koloda/app";
import type { Template } from "@koloda/srs";
import { useSetAtom, useStore } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useEffect, useRef } from "react";
import { aiProfileStateAtom } from "./ai-profile-state";
import {
  assistantConversationStateAtom,
  bumpPendingSaveAtom,
  dispatchToConversationOnStore,
  newConversationAtom,
  setAssistantAIProfileAtom,
  setAssistantModeAtom,
} from "./assistant-conversation-atoms";
import type { ConversationAction } from "./conversation-state";
import { useAssistantConfig } from "./use-assistant-config";
import { useAssistantConfiguration } from "./use-assistant-configuration";
import { useAssistantStreamSetup } from "./use-assistant-stream-setup";
import { useConversationPersistence } from "./use-conversation-persistence";
import { useGlobalAIProfileState } from "./use-global-ai-profile-state";
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
  handleModelParameterChange: (type: ModelParameter["type"], value: string) => void;
  handleGenerate: (value?: string) => Promise<void>;
  handleCancel: () => void;
  handleReset: () => void;
  handleRetry: (runId: string) => Promise<void>;
  retryLoad: () => Promise<unknown>;
  setMode: (mode: AIChatMode) => void;
};

export function useAssistantChat(
  { conversationId, onConversationIdChange }: UseAssistantChatOptions,
): UseAssistantChatReturn {
  const setConversationAction = useSetAtom(assistantConversationStateAtom);
  const setMode = useSetAtom(setAssistantModeAtom);
  const bumpPendingSave = useSetAtom(bumpPendingSaveAtom);
  const newConversation = useSetAtom(newConversationAtom);
  const setAIProfile = useSetAtom(setAssistantAIProfileAtom);
  const [_state, setGlobalAIProfileState] = useGlobalAIProfileState();

  const {
    profileId,
    modelId,
    modelName,
    models,
    isModelsLoading,
    isModelsError,
    selectedProfile,
    provider,
    modelParameters,
    handleProfileChange,
    handleModelChange,
    handleModelParameterChange,
  } = useAssistantConfiguration();
  const reasoningEffort = modelParameters.find((p) => p.type === "reasoning_effort")?.value ?? "";

  const { defaultProfileId, profiles, missingSecretFieldLabels } = useAIProfiles(profileId);
  const hasRequiredSecrets = missingSecretFieldLabels.length === 0;

  // Set default profile on first mount
  useEffect(() => {
    if (defaultProfileId && !profileId) {
      const profile = profiles.find((p) => p.id === defaultProfileId);
      setAIProfile({ profileId: defaultProfileId, modelId: profile?.lastUsedModel ?? null, modelParameters: {} });
    }
  }, [defaultProfileId, profileId, profiles, setAIProfile]);

  const assistantConfig = useAssistantConfig({ profileId, modelId, modelName, reasoningEffort, selectedProfile });
  const { template, templateId, configRef } = assistantConfig;

  const readState = useAtomCallback((get) => get(assistantConversationStateAtom));
  const readLastUsed = useAtomCallback((get) => get(aiProfileStateAtom));
  const store = useStore();

  const dispatchAction = useCallback((action: ConversationAction) => {
    setConversationAction(action);
    bumpPendingSave();
  }, [setConversationAction, bumpPendingSave]);

  // Dispatch an action to a specific conversation by id, regardless of which
  // conversation is currently visible. Used by background stream callbacks so
  // that chunks and completion land on the originating conversation.
  const dispatchFor = useCallback((id: string, action: ConversationAction) => {
    dispatchToConversationOnStore(store, id, action);
  }, [store]);

  const { armPendingRun, executeChatRun, executeGenerateRun, retryRun, cancel } = useAssistantStreamSetup({
    streamGenerator: configRef.current.streamGenerator,
    chatStreamGenerator: configRef.current.chatStreamGenerator,
    dispatchAction,
    dispatchFor,
    readState,
  });

  const handleCancel = useCallback(() => {
    const currentActiveRunId = readState().activeRunId;
    if (currentActiveRunId) dispatchAction({ type: "cancelRun", runId: currentActiveRunId });
    cancel();
  }, [dispatchAction, cancel, readState]);

  const handleReset = useCallback(() => {
    const stored = readLastUsed();
    const newId = newConversation(stored ?? undefined);
    onConversationIdChange(newId);
  }, [newConversation, onConversationIdChange, readLastUsed]);

  // Holds the id assigned locally before the URL has caught up (cold start).
  const localConversationIdRef = useRef<string | null>(conversationId ?? null);

  const { handleDismissSave, isRestoring, loadError, retryLoad } = useConversationPersistence({ conversationId });

  const ensureConversationId = useCallback(() => {
    if (conversationId) return conversationId;
    if (!localConversationIdRef.current) {
      const id = generateUUID();
      localConversationIdRef.current = id;
      const stored = readLastUsed();
      dispatchAction({
        type: "newConversation",
        id,
        createdAt: new Date(),
        ...stored,
      });
      onConversationIdChange(id);
    }
    return localConversationIdRef.current;
  }, [conversationId, onConversationIdChange, dispatchAction, readLastUsed]);

  const { handleGenerate, handleRetry, handleDismissGenerate } = useRunOrchestration({
    configRef,
    readState,
    dispatchAction,
    setGlobalAIProfileState,
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
    handleModelParameterChange,
    handleGenerate,
    handleCancel,
    handleReset,
    handleRetry,
    retryLoad,
    setMode,
  };
}
