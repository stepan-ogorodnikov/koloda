import type { AISecrets, AssistantSettings, ModelParameter } from "@koloda/ai";
import { computeConversationTitle, generateCardsInputSchema, getTextMessageContent } from "@koloda/ai";
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
import { aiProfileStateAtom } from "./ai-profile-state";
import {
  assistantCancelFunctionsAtom,
  assistantConversationStateAtom,
  assistantDeckIdAtom,
  bumpPendingSaveAtom,
  conversationsAtom,
  dismissSaveStatusAtom,
  dispatchToConversationOnStore,
  newConversationAtom,
  pendingSaveAtom,
  saveStatusAtom,
  setAssistantAIProfileAtom,
  setAssistantModeAtom,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "./assistant-conversation-atoms";
import { buildConversationMessages, getAssistantMetadata } from "./assistant-messages";
import { coerceConversationState, initialConversationState, normalizeRestoredConversation } from "./conversation-state";
import type { ConversationAction, ConversationState } from "./conversation-state";
import { useAssistantCardGeneration } from "./use-assistant-card-generation";
import type { CardGenerationStreamRequest } from "./use-assistant-card-generation";
import { useAssistantClient } from "./use-assistant-client";
import { useAssistantConfiguration } from "./use-assistant-configuration";
import type { AssistantConversationConfig } from "./use-assistant-conversation";
import { useConversationRuns } from "./use-conversation-runs";
import { useGlobalAIProfileState } from "./use-global-ai-profile-state";

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
  const setCurrentConversationId = useSetAtom(setCurrentConversationIdAtom);
  const upsertConversation = useSetAtom(upsertConversationAtom);
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

  const { streamGenerator, chatStreamGenerator } = useAssistantClient({
    selectedProfile,
    template,
  });

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

  // Pending-run-failure refs, one per stream hook. We keep them separate
  // (rather than a single Map) because the underlying stream hooks
  // (`useAssistantCardGeneration` and `useChatStream`) are independent
  // and can each have an in-flight run on a different conversation. The
  // error callback for each hook only fires for *its* stream, so a single
  // shared ref + iterating lookup would route errors to the wrong
  // conversation when both streams are in flight.
  const pendingChatRunRef = useRef<{ id: string; runId: string } | null>(null);
  const pendingCardRunRef = useRef<{ id: string; runId: string } | null>(null);

  const dispatchAction = useCallback(
    (action: ConversationAction) => {
      dispatchAndBump(setConversationAction, bumpPendingSave, action);
    },
    [setConversationAction, bumpPendingSave],
  );

  // Dispatch an action to a specific conversation by id, regardless of which
  // conversation is currently visible. Used by background stream callbacks so
  // that chunks and completion land on the originating conversation.
  const dispatchFor = useCallback(
    (id: string, action: ConversationAction) => {
      dispatchToConversationOnStore(store, id, action);
    },
    [store],
  );

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
    if (pendingChatRunRef.current?.runId === runId) {
      pendingChatRunRef.current = null;
    }
  }, []);

  const onCardStreamComplete = useCallback((runId: string) => {
    if (pendingCardRunRef.current?.runId === runId) {
      pendingCardRunRef.current = null;
    }
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

  const handleRetry = useCallback(
    async (runId: string) => {
      const cfg = configRef.current;
      const currentState = readState();
      const conversationId = currentState.id;
      const run = currentState.runs[runId];
      let mode: AIChatMode | undefined = run?.mode;
      if (!mode) {
        const assistantMessage = currentState.messages.find((m) => m.id === `assistant-${runId}`);
        const metadata = assistantMessage ? getAssistantMetadata(assistantMessage) : null;
        if (metadata?.kind === "error") mode = metadata.mode;
        return;
      }

      // Arm the per-stream failure ref *before* the retry stream starts so
      // that an error during the retry is routed to the right conversation
      // and run. The execute function clears it on completion.
      const pendingRef = mode === "chat" ? pendingChatRunRef : pendingCardRunRef;
      pendingRef.current = { id: conversationId, runId };

      const userMessage = currentState.messages.find((m) => m.id === `user-${runId}`);
      const promptText = userMessage ? getTextMessageContent(userMessage) : "";
      if (!promptText || !cfg.profileId || !cfg.modelId) return;
      if (mode === "cards" && !cfg.template) return;

      setGlobalAIProfileState(cfg);

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
        ...(mode === "cards" && cfg.deckId != null ? { deckId: cfg.deckId } : {}),
        ...(mode === "cards" && cfg.templateId != null ? { templateId: cfg.templateId } : {}),
      });

      if (mode === "chat") {
        const chatRequest: ChatStreamRequest = {
          input,
          messages: [...conversationMessages, { role: "user", content: promptText }],
          template: cfg.template ?? undefined,
          systemPromptTemplate: cfg.chatPromptTemplate ?? undefined,
        };
        await retryRun(runId, chatRequest, null, mode, cfg.modelName);
      } else {
        const request: CardGenerationStreamRequest = {
          input,
          messages: conversationMessages,
          systemPromptTemplate: cfg.cardsPromptTemplate ?? undefined,
        };
        const templateFields: TemplateFields | null = cfg.template ? cfg.template.content.fields : null;
        await retryRun(runId, request, templateFields, mode, cfg.modelName);
      }
      // The execute function's `finally` clears the failure ref now that the
      // stream has ended. No re-arm needed.
    },
    [retryRun, readState, setGlobalAIProfileState],
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

  const readStateForSave = useAtomCallback((get) => get(assistantConversationStateAtom));

  // Subscribe to the save trigger before the restore effect runs so that any
  // pendingSave bump emitted by restore (e.g. after creating a conversation
  // from ?deckId) is observed and flushed to the DB.
  useEffect(() => {
    if (!conversationId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastFiredAt = 0;

    const flush = () => {
      timer = null;
      // Read the conversation state directly from the store map so we always
      // get the latest data regardless of which conversation is current.
      const storeState = store.get(conversationsAtom);
      const state = storeState[conversationId];
      if (!state) return;
      if (state.messages.length === 0 && state.activeRunId === null) return;

      const title = computeConversationTitle(state);
      const row: Conversation = {
        id: state.id,
        title,
        state: JSON.parse(JSON.stringify(state)),
        createdAt: state.createdAt,
        updatedAt: state.updatedAt ?? null,
      };
      const data: SetConversationData = {
        id: row.id,
        state: row.state,
        title,
        updatedAt: state.updatedAt,
      };
      tokenAtSaveRef.current = saveTokenRef.current;
      setConversation.mutate(data);
    };

    const handler = () => {
      if (restoredIdRef.current !== conversationId) return;
      if (lastSavedIdRef.current !== conversationId) return;
      // Check if this specific conversation has an active run.
      const isStreaming = store.get(conversationsAtom)[conversationId]?.activeRunId != null;
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

    // Switch to the new conversation. This is a read-only swap — the old
    // conversation's state remains in conversationsAtom.
    setCurrentConversationId(conversationId);

    // If the store already has state for this id (e.g. it was created locally
    // on a cold start, or a background run kept it warm), keep it — do NOT
    // overwrite from the DB. This is the key behavioral change that lets
    // background runs survive conversation switches.
    const storeState = store.get(conversationsAtom);
    if (storeState[conversationId]) {
      restoredIdRef.current = conversationId;
      lastSavedIdRef.current = conversationId;
      bumpPendingSave();
      return;
    }

    const loaded = conversationData?.state;
    const coerced = coerceConversationState(loaded);
    let normalized = false;
    if (coerced) {
      const clean = normalizeRestoredConversation(coerced);
      if (clean) {
        upsertConversation(clean);
        normalized = true;
      } else {
        upsertConversation(coerced);
      }
    } else {
      const stored = readLastUsed();
      const fresh: ConversationState = {
        ...initialConversationState,
        id: conversationId,
        createdAt: new Date(),
        ...stored,
      };
      upsertConversation(fresh);
      normalized = true;
    }
    restoredIdRef.current = conversationId;
    lastSavedIdRef.current = conversationId;
    if (normalized) {
      bumpPendingSave();
    }
  }, [
    store,
    conversationId,
    conversationData,
    conversationQuery.isLoading,
    conversationQuery.isFetching,
    conversationError,
    setCurrentConversationId,
    upsertConversation,
    bumpPendingSave,
    readLastUsed,
  ]);

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
      // After ensureConversationId(), the conversation is in the store.
      // Use the state's id rather than the prop (which may be undefined on cold start).
      const activeConversationId = readState().id;
      // Arm the per-stream failure ref so an error during this run routes
      // back to the originating conversation. The execute function's
      // `finally` clears it on completion.
      const pendingRef = currentMode === "chat" ? pendingChatRunRef : pendingCardRunRef;
      pendingRef.current = { id: activeConversationId, runId };

      setGlobalAIProfileState(cfg);

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
        dispatchAction({
          type: "startRun",
          runId,
          mode: "chat",
          request: chatRequest,
          templateFields: null,
          modelName: cfg.modelName,
        });
        dispatchAction({ type: "addAssistantMessage", runId, kind: "chat-text", text: "" });
        await executeChatRun(activeConversationId, runId, chatRequest);
      } else {
        const request: CardGenerationStreamRequest = {
          input,
          messages: conversationMessages,
          systemPromptTemplate: cfg.cardsPromptTemplate ?? undefined,
        };
        const templateFields = cfg.template ? cfg.template.content.fields : null;
        dispatchAction({
          type: "startRun",
          runId,
          mode: "cards",
          request,
          templateFields,
          modelName: cfg.modelName,
        });
        dispatchAction({
          type: "addAssistantMessage",
          runId,
          kind: "generated-cards",
          text: cfg._(msg`assistant.chat.message.status.pending`),
        });
        await executeGenerateRun(activeConversationId, runId, request);
      }
    },
    [
      ensureConversationId,
      dispatchAction,
      executeChatRun,
      executeGenerateRun,
      readState,
      setGlobalAIProfileState,
    ],
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
