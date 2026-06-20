import type { AISecrets, AssistantSettings, ModelParameter } from "@koloda/ai";
import { generateCardsInputSchema, getTextMessageContent } from "@koloda/ai";
import type { ChatStreamRequest } from "@koloda/ai";
import { useAIProfiles, useChatStream } from "@koloda/ai-react";
import type { AIChatMode } from "@koloda/ai-react";
import type { Conversation, SetConversationData } from "@koloda/app";
import { generateUUID } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Template, TemplateFields } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useEffect, useRef } from "react";
import {
  assistantActiveRunIdAtom,
  assistantCancelFunctionsAtom,
  assistantConversationStateAtom,
  assistantDeckIdAtom,
  dismissSaveStatusAtom,
  newConversationAtom,
  pendingSaveAtom,
  restoreConversationAtom,
  saveStatusAtom,
  setAssistantModeAtom,
} from "./assistant-conversation-atoms";
import { buildConversationMessages } from "./assistant-messages";
import { coerceConversationState, normalizeRestoredConversation } from "./conversation-state";
import type { ConversationAction, ConversationState } from "./conversation-state";
import { useAssistantCardGeneration } from "./use-assistant-card-generation";
import type { CardGenerationStreamRequest } from "./use-assistant-card-generation";
import { useAssistantClient } from "./use-assistant-client";
import { useAssistantConfiguration } from "./use-assistant-configuration";
import type { AssistantConversationConfig } from "./use-assistant-conversation";
import { useConversationRuns } from "./use-conversation-runs";

const STREAM_SAVE_THROTTLE_MS = 1000;
const IDLE_SAVE_DEBOUNCE_MS = 250;

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
  handleRetryLoad: () => Promise<unknown>;
  setMode: (mode: AIChatMode) => void;
};

function dispatchAndBump(
  setConversationAction: (update: ConversationAction | ((prev: ConversationState) => ConversationState)) => void,
  setPendingSave: (updater: (n: number) => number) => void,
  action: ConversationAction,
) {
  const now = new Date();
  setConversationAction((prev) => ({ ...prev, updatedAt: now }));
  setConversationAction(action);
  setPendingSave((n) => n + 1);
}

export function useAssistantChat(
  { conversationId, onConversationIdChange }: UseAssistantChatOptions,
): UseAssistantChatReturn {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const {
    getDeckQuery,
    getTemplateQuery,
    touchAIProfileMutation,
    getSettingsQuery,
    getConversationQuery,
    setConversationMutation,
  } = useAtomValue(queriesAtom);
  const setConversationAction = useSetAtom(assistantConversationStateAtom);
  const setMode = useSetAtom(setAssistantModeAtom);
  const restoreConversation = useSetAtom(restoreConversationAtom);
  const setPendingSave = useSetAtom(pendingSaveAtom);
  const newConversation = useSetAtom(newConversationAtom);
  const deckId = useAtomValue(assistantDeckIdAtom);

  const { data: aiSettings } = useQuery({
    ...getSettingsQuery("ai"),
    queryKey: queryKeys.settings.detail("ai"),
  });
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
    temperature,
    reasoningEffort,
    modelParameters,
    handleProfileChange,
    handleModelChange,
    handleModelParameterChange,
  } = useAssistantConfiguration(assistantSettings);

  const { defaultProfileId, missingSecretFieldLabels } = useAIProfiles(profileId);
  const hasRequiredSecrets = missingSecretFieldLabels.length === 0;

  useEffect(() => {
    if (defaultProfileId && !profileId) {
      handleProfileChange(defaultProfileId);
    }
  }, [defaultProfileId, profileId, handleProfileChange]);

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

  const dispatchAction = useCallback(
    (action: ConversationAction) => {
      dispatchAndBump(setConversationAction, setPendingSave, action);
    },
    [setConversationAction, setPendingSave],
  );

  const { executeChatRun, executeGenerateRun, retryRun } = useConversationRuns(
    streamChat,
    generate,
    dispatchAction,
    readState,
  );

  const handleRetry = useCallback(
    async (runId: string) => {
      const cfg = configRef.current;
      const currentState = readState();
      const run = currentState.runs[runId];
      if (!run) return;

      pendingRunFailureRef.current = null;
      const userMessage = currentState.messages.find((m) => m.id === `user-${runId}`);
      const promptText = userMessage ? getTextMessageContent(userMessage) : "";
      if (!promptText || !cfg.profileId || !cfg.modelId) return;
      if (run.mode === "cards" && !cfg.template) return;

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
        ...(run.mode === "cards" && cfg.deckId != null ? { deckId: cfg.deckId } : {}),
        ...(run.mode === "cards" && cfg.templateId != null ? { templateId: cfg.templateId } : {}),
      });

      if (run.mode === "chat") {
        const chatRequest: ChatStreamRequest = {
          input,
          messages: [...conversationMessages, { role: "user", content: promptText }],
          template: cfg.template ?? undefined,
          systemPromptTemplate: cfg.chatPromptTemplate ?? undefined,
        };
        await retryRun(runId, chatRequest, null);
      } else {
        const request: CardGenerationStreamRequest = {
          input,
          messages: conversationMessages,
          systemPromptTemplate: cfg.cardsPromptTemplate ?? undefined,
        };
        const templateFields: TemplateFields | null = cfg.template ? cfg.template.content.fields : null;
        await retryRun(runId, request, templateFields);
      }
      pendingRunFailureRef.current = runId;
    },
    [retryRun, readState],
  );

  const saveTokenRef = useRef(0);
  const tokenAtSaveRef = useRef(0);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const setSaveStatus = useSetAtom(saveStatusAtom);

  const { mutationFn: setConversationFn } = setConversationMutation();
  const setConversation = useMutation({
    mutationFn: setConversationFn,
    onSuccess: (row) => {
      lastSavedIdRef.current = row.id;
      setSaveStatus({ conversationId: conversationIdRef.current ?? null, message: null, isDismissed: false });
      queryClient.setQueryData(queryKeys.conversations.detail(row.id), row);
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all() });
      const savedAt = row.updatedAt ? new Date(row.updatedAt) : null;
      if (savedAt) {
        setConversationAction((prev) => {
          if (prev.id !== row.id) return prev;
          const prevAt = prev.updatedAt instanceof Date ? prev.updatedAt : null;
          if (prevAt && prevAt.getTime() >= savedAt.getTime()) return prev;
          return { ...prev, updatedAt: savedAt };
        });
      }
    },
    onError: (error) => {
      console.error("Failed to save conversation", error);
      lastSavedIdRef.current = null;
      if (tokenAtSaveRef.current === saveTokenRef.current) {
        setSaveStatus({
          conversationId: conversationIdRef.current ?? null,
          message: (error as Error).message,
          isDismissed: false,
        });
      }
    },
  });

  const dismissSaveStatus = useSetAtom(dismissSaveStatusAtom);
  const pendingRunFailureRef = useRef<string | null>(null);

  useEffect(() => {
    if (generateError && pendingRunFailureRef.current) {
      const runId = pendingRunFailureRef.current;
      pendingRunFailureRef.current = null;
      dispatchAction({ type: "runFailed", runId, error: { message: generateError.message } });
    }
  }, [generateError, dispatchAction]);

  const handleDismissGenerate = useCallback(() => {
    const state = readState();
    const ids = Object.keys(state.runs);
    for (let i = ids.length - 1; i >= 0; i--) {
      const run = state.runs[ids[i]];
      if (run.status === "failed") {
        dispatchAction({ type: "dismissRunError", runId: run.id });
        return;
      }
    }
  }, [readState, dispatchAction]);

  const handleDismissSave = dismissSaveStatus;

  useEffect(() => {
    saveTokenRef.current += 1;
  }, [conversationId]);

  const conversationQuery = useQuery({
    ...getConversationQuery(conversationId!),
    queryKey: queryKeys.conversations.detail(conversationId!),
    enabled: !!conversationId,
  });
  const { data: conversationData, error: conversationError, refetch: refetchConversation } = conversationQuery;

  const restoredIdRef = useRef<string | null>(null);
  const lastSavedIdRef = useRef<string | null>(null);
  // Holds the id assigned locally before the URL has caught up (cold start).
  const localConversationIdRef = useRef<string | null>(conversationId ?? null);

  const store = useStore();
  const readStateForSave = useAtomCallback((get) => get(assistantConversationStateAtom));

  // Subscribe to the save trigger before the restore effect runs so that any
  // pendingSave bump emitted by restore (e.g. after creating a conversation
  // from ?deckId) is observed and flushed to the DB.
  useEffect(() => {
    if (!conversationId) return;
    const effectConversationId = conversationId;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastFiredAt = 0;

    const flush = () => {
      timer = null;
      const state = readStateForSave();
      if (state.id !== effectConversationId) return;
      if (state.messages.length === 0 && state.activeRunId === null) return;

      const row: Conversation = {
        id: state.id,
        state: JSON.parse(JSON.stringify(state)),
        createdAt: state.createdAt,
        updatedAt: state.updatedAt ?? new Date(),
      };
      const data: SetConversationData = { id: row.id, state: row.state };
      tokenAtSaveRef.current = saveTokenRef.current;
      setConversation.mutate(data);
    };

    const handler = () => {
      if (restoredIdRef.current !== conversationId) return;
      if (lastSavedIdRef.current !== conversationId) return;
      const isStreaming = store.get(assistantActiveRunIdAtom) !== null;
      const now = Date.now();
      const wait = isStreaming ? STREAM_SAVE_THROTTLE_MS : IDLE_SAVE_DEBOUNCE_MS;
      const sinceLast = now - lastFiredAt;
      const delay = Math.max(0, wait - sinceLast);

      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
      lastFiredAt = now + delay;
    };

    const unsub = store.sub(pendingSaveAtom, handler);

    const flushNow = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
    };

    const handlePageHide = () => flushNow();
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      unsub();
      if (timer) {
        clearTimeout(timer);
        flush();
      }
    };
  }, [store, conversationId, readStateForSave, setConversation]);

  useEffect(() => {
    if (!conversationId) return;
    if (restoredIdRef.current === conversationId) return;
    if (conversationQuery.isLoading) return;
    if (conversationQuery.isFetching && !conversationData) return;
    // Don't overwrite the atom with a fresh empty state when the query failed.
    // The UI will surface the error and offer a retry.
    if (conversationError) return;

    // If the atom already contains state for this id, it was created locally
    // (e.g. first message on a cold start) and is newer than anything in the DB.
    // Keep it and mark the conversation as restored.
    const currentState = store.get(assistantConversationStateAtom);
    if (currentState.id === conversationId) {
      restoredIdRef.current = conversationId;
      lastSavedIdRef.current = conversationId;
      setPendingSave((n) => n + 1);
      return;
    }

    const loaded = conversationData?.state;
    const coerced = coerceConversationState(loaded);
    if (coerced) {
      restoreConversation(normalizeRestoredConversation(coerced));
    } else {
      const fresh: ConversationState = {
        id: conversationId,
        createdAt: new Date(),
        updatedAt: null,
        messages: [],
        runs: {},
        activeRunId: null,
        dismissedRunErrorId: null,
        mode: "chat",
        deckId: null,
      };
      restoreConversation(fresh);
    }
    restoredIdRef.current = conversationId;
    setPendingSave((n) => n + 1);
  }, [
    store,
    conversationId,
    conversationData,
    conversationQuery.isLoading,
    conversationQuery.isFetching,
    conversationError,
    restoreConversation,
    setPendingSave,
  ]);

  const ensureConversationId = useCallback(() => {
    if (conversationId) return conversationId;
    if (!localConversationIdRef.current) {
      const id = generateUUID();
      localConversationIdRef.current = id;
      dispatchAction({ type: "newConversation", id, createdAt: new Date() });
      onConversationIdChange(id);
    }
    return localConversationIdRef.current;
  }, [conversationId, onConversationIdChange, dispatchAction]);

  const handleGenerate = useCallback(
    async (value?: string) => {
      ensureConversationId();
      const cfg = configRef.current;
      const currentState = readState();
      const currentMode = currentState.mode;

      const promptText = (value ?? "").trim();
      if (!promptText || !cfg.profileId || !cfg.modelId) return;
      if (currentMode === "cards" && !cfg.template) return;

      const runId = generateUUID();
      pendingRunFailureRef.current = null;
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
        ...(currentMode === "cards" && cfg.deckId !== null && cfg.deckId !== undefined
          ? { deckId: cfg.deckId }
          : {}),
        ...(currentMode === "cards" && cfg.templateId !== null && cfg.templateId !== undefined
          ? { templateId: cfg.templateId }
          : {}),
      });

      dispatchAction({ type: "addUserMessage", runId, text: promptText });

      if (currentMode === "chat") {
        const chatRequest: ChatStreamRequest = {
          input,
          messages: [...conversationMessages, { role: "user", content: promptText }],
          template: cfg.template ?? undefined,
          systemPromptTemplate: cfg.chatPromptTemplate ?? undefined,
        };
        dispatchAction({ type: "startRun", runId, mode: "chat", request: chatRequest, templateFields: null });
        dispatchAction({ type: "addAssistantMessage", runId, kind: "chat-text", text: "" });
        pendingRunFailureRef.current = runId;
        await executeChatRun(runId, chatRequest);
      } else {
        const request: CardGenerationStreamRequest = {
          input,
          messages: conversationMessages,
          systemPromptTemplate: cfg.cardsPromptTemplate ?? undefined,
        };
        const templateFields = cfg.template ? cfg.template.content.fields : null;
        dispatchAction({ type: "startRun", runId, mode: "cards", request, templateFields });
        dispatchAction({
          type: "addAssistantMessage",
          runId,
          kind: "generated-cards",
          text: cfg._(msg`assistant.chat.message.status.pending`),
        });
        pendingRunFailureRef.current = runId;
        await executeGenerateRun(runId, request);
      }
    },
    [ensureConversationId, dispatchAction, executeChatRun, executeGenerateRun, readState],
  );

  const handleCancel = useCallback(() => {
    const currentActiveRunId = readState().activeRunId;
    if (currentActiveRunId) dispatchAction({ type: "cancelRun", runId: currentActiveRunId });
    cancelGenerate();
    cancelChat();
  }, [dispatchAction, cancelGenerate, cancelChat, readState]);

  const handleReset = useCallback(() => {
    const newId = newConversation();
    onConversationIdChange(newId);
  }, [newConversation, onConversationIdChange]);

  const handleRetryLoad = useCallback(() => refetchConversation(), [refetchConversation]);

  const contextLength = models.find((m) => m.id === modelId)?.context_length ?? 0;

  const isRestoring = !!conversationId && conversationQuery.isLoading && restoredIdRef.current !== conversationId;

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
    loadError: conversationError ?? null,
    handleDismissGenerate,
    handleDismissSave,
    handleProfileChange,
    handleModelChange,
    handleModelParameterChange,
    handleGenerate,
    handleCancel,
    handleReset,
    handleRetry,
    handleRetryLoad,
    setMode,
  };
}
