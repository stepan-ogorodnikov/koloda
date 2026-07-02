import type { AISecrets, AssistantSettings, ModelParameter } from "@koloda/ai";
import { useAIProfiles, useChatStream } from "@koloda/ai-react";
import type { AIChatMode } from "@koloda/ai-react";
import { generateUUID } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Template } from "@koloda/srs";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useEffect, useRef } from "react";
import { aiProfileStateAtom } from "./ai-profile-state";
import {
  assistantCancelFunctionsAtom,
  assistantConversationStateAtom,
  assistantDeckIdAtom,
  bumpPendingSaveAtom,
  dispatchToConversationOnStore,
  newConversationAtom,
  setAssistantAIProfileAtom,
  setAssistantModeAtom,
} from "./assistant-conversation-atoms";
import type { ConversationAction, ConversationState } from "./conversation-state";
import { useAssistantCardGeneration } from "./use-assistant-card-generation";
import { useAssistantClient } from "./use-assistant-client";
import { useAssistantConfiguration } from "./use-assistant-configuration";
import type { AssistantConversationConfig } from "./use-assistant-conversation";
import { useConversationPersistence } from "./use-conversation-persistence";
import { useConversationRuns } from "./use-conversation-runs";
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

function dispatchAndBump(
  setConversationAction: (update: ConversationAction | ((prev: ConversationState) => ConversationState)) => void,
  bumpPendingSave: () => void,
  action: ConversationAction,
) {
  const now = new Date();
  setConversationAction((prev) => ({ ...prev, updatedAt: now }));
  setConversationAction(action);
  bumpPendingSave();
}

export function useAssistantChat(
  { conversationId, onConversationIdChange }: UseAssistantChatOptions,
): UseAssistantChatReturn {
  const { _ } = useLingui();
  const { getDeckQuery, getTemplateQuery, touchAIProfileMutation, getSettingsQuery } = useAtomValue(queriesAtom);
  const setConversationAction = useSetAtom(assistantConversationStateAtom);
  const setMode = useSetAtom(setAssistantModeAtom);
  const bumpPendingSave = useSetAtom(bumpPendingSaveAtom);
  const newConversation = useSetAtom(newConversationAtom);
  const setAIProfile = useSetAtom(setAssistantAIProfileAtom);
  const deckId = useAtomValue(assistantDeckIdAtom);
  const [_state, setGlobalAIProfileState] = useGlobalAIProfileState();
  const { data: aiSettings } = useQuery({ ...getSettingsQuery("ai"), queryKey: queryKeys.settings.detail("ai") });
  const assistantSettings = aiSettings?.content?.assistant as AssistantSettings | undefined;

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
  const temperature = assistantSettings?.temperature ?? 0.2;
  const reasoningEffort = modelParameters.find((p) => p.type === "reasoning_effort")?.value ?? "";

  const { defaultProfileId, profiles, missingSecretFieldLabels } = useAIProfiles(profileId);
  const hasRequiredSecrets = missingSecretFieldLabels.length === 0;

  useEffect(() => {
    if (defaultProfileId && !profileId) {
      const profile = profiles.find((p) => p.id === defaultProfileId);
      setAIProfile({ profileId: defaultProfileId, modelId: profile?.lastUsedModel ?? null, modelParameters: {} });
    }
  }, [defaultProfileId, profileId, profiles, setAIProfile]);

  const cardsPromptTemplate = assistantSettings?.cardsPromptTemplate ?? null;
  const chatPromptTemplate = assistantSettings?.chatPromptTemplate ?? null;

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

  const { streamGenerator, chatStreamGenerator } = useAssistantClient({ selectedProfile, template });

  const conversationConfig: AssistantConversationConfig = {
    profileId,
    modelId,
    modelName,
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
  const readLastUsed = useAtomCallback((get) => get(aiProfileStateAtom));

  const store = useStore();

  // Per-stream failure refs, one per stream hook. We keep them separate
  // (rather than a single Map) because the underlying stream hooks
  // (`useAssistantCardGeneration` and `useChatStream`) are independent
  // and can each have an in-flight run on a different conversation. The
  // error callback for each hook only fires for *its* stream, so a single
  // shared ref + iterating lookup would route errors to the wrong
  // conversation when both streams are in flight.
  const pendingChatRunRef = useRef<{ id: string; runId: string } | null>(null);
  const pendingCardRunRef = useRef<{ id: string; runId: string } | null>(null);

  const dispatchAction = useCallback((action: ConversationAction) => {
    dispatchAndBump(setConversationAction, bumpPendingSave, action);
  }, [setConversationAction, bumpPendingSave]);

  // Dispatch an action to a specific conversation by id, regardless of which
  // conversation is currently visible. Used by background stream callbacks so
  // that chunks and completion land on the originating conversation.
  const dispatchFor = useCallback((id: string, action: ConversationAction) => {
    dispatchToConversationOnStore(store, id, action);
  }, [store]);

  const handleChatStreamError = useCallback((error: Error) => {
    const entry = pendingChatRunRef.current;
    if (!entry) return;
    pendingChatRunRef.current = null;
    dispatchFor(entry.id, { type: "runFailed", runId: entry.runId, error: { message: error.message } });
  }, [dispatchFor]);

  const handleCardStreamError = useCallback((error: Error) => {
    const entry = pendingCardRunRef.current;
    if (!entry) return;
    pendingCardRunRef.current = null;
    dispatchFor(entry.id, { type: "runFailed", runId: entry.runId, error: { message: error.message } });
  }, [dispatchFor]);

  // Called by `executeChatRun` after the chat stream ends. Only clears the
  // ref if the runId still matches — otherwise a previous (now-aborted)
  // stream's `finally` would clobber a newer stream's entry.
  const onChatStreamComplete = useCallback((runId: string) => {
    if (pendingChatRunRef.current?.runId === runId) pendingChatRunRef.current = null;
  }, []);

  const onCardStreamComplete = useCallback((runId: string) => {
    if (pendingCardRunRef.current?.runId === runId) pendingCardRunRef.current = null;
  }, []);

  const { generate, cancel: cancelGenerate } = useAssistantCardGeneration(streamGenerator, handleCardStreamError);

  const { stream: streamChat, cancel: cancelChat } = useChatStream(chatStreamGenerator, handleChatStreamError);

  const setCancelFunctions = useSetAtom(assistantCancelFunctionsAtom);

  useEffect(() => {
    setCancelFunctions({ cancelGenerate, cancelChat });
  }, [cancelGenerate, cancelChat, setCancelFunctions]);

  const { executeChatRun, executeGenerateRun, retryRun } = useConversationRuns(
    streamChat,
    generate,
    dispatchAction,
    dispatchFor,
    readState,
    onChatStreamComplete,
    onCardStreamComplete,
  );

  const handleCancel = useCallback(() => {
    const currentActiveRunId = readState().activeRunId;
    if (currentActiveRunId) dispatchAction({ type: "cancelRun", runId: currentActiveRunId });
    cancelGenerate();
    cancelChat();
  }, [dispatchAction, cancelGenerate, cancelChat, readState]);

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
    pendingChatRunRef,
    pendingCardRunRef,
  });

  const contextLength = models.find((m) => m.id === modelId)?.context_length ?? 0;

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
    contextLength,
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
