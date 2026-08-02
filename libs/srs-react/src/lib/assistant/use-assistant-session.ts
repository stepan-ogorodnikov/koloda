import type { AIChatMode, AIProfile, ModelParameter } from "@koloda/ai";
import { generateUUID } from "@koloda/app";
import type { Template } from "@koloda/srs";
import { useSetAtom, useStore } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useRef } from "react";
import type { AIProfileStateUpdater } from "./ai-profile-state";
import { aiProfileStateAtom } from "./ai-profile-state";
import { newConversationAtom, setAssistantModeAtom } from "./conversation-actions";
import type { ConversationReducerAction } from "./conversation-reducer";
import {
  assistantConversationStateAtom,
  dispatchToConversationOnStore,
  markReadIfCurrentOnStore,
  touchAtom,
} from "./conversation-store";
import { useAssistantRuntimeConfig } from "./use-assistant-runtime-config";
import { useConversationRuns } from "./use-conversation-runs";
import { useRunOrchestration } from "./use-run-orchestration";

export type UseAssistantSessionOptions = {
  conversationId: string | undefined;
  onConversationIdChange: (id: string) => void;
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  modelParameters: ModelParameter[];
  selectedProfile: AIProfile | null;
  setGlobalAIProfileState: (updater: AIProfileStateUpdater) => void;
};

export type UseAssistantSessionReturn = {
  template: Template | null | undefined;
  templateId: Template["id"] | undefined;
  handleGenerate: (value?: string) => Promise<void>;
  handleCancel: () => void;
  handleReset: () => void;
  handleRetry: (runId: string) => Promise<void>;
  handleRevert: (userMessageId: string, currentInputText: string) => string | null;
  handleRestore: () => string | null;
  handleDismissGenerate: () => void;
  setMode: (mode: AIChatMode) => void;
};

export function useAssistantSession({
  conversationId,
  onConversationIdChange,
  profileId,
  modelId,
  modelName,
  modelParameters,
  selectedProfile,
  setGlobalAIProfileState,
}: UseAssistantSessionOptions): UseAssistantSessionReturn {
  const setConversationReducerAction = useSetAtom(assistantConversationStateAtom);
  const setMode = useSetAtom(setAssistantModeAtom);
  const touch = useSetAtom(touchAtom);
  const newConversation = useSetAtom(newConversationAtom);

  const reasoningEffort = modelParameters.find((p) => p.type === "reasoning_effort")?.value ?? "";

  const { template, templateId, configRef } = useAssistantRuntimeConfig({
    profileId,
    modelId,
    modelName,
    reasoningEffort,
    selectedProfile,
  });

  const readState = useAtomCallback((get) => get(assistantConversationStateAtom));
  const readLastUsed = useAtomCallback((get) => get(aiProfileStateAtom));
  const store = useStore();

  // WHY: Keep three named helpers (dispatch / by-id / local) instead of
  // one options-bag. Collapsing them makes it easy to touch() on stream
  // chunks or persist in-memory revertState. `dispatchToConversation`
  // never auto-touches — terminal success/abort calls touch() explicitly
  // in useConversationRuns.
  const dispatch = useCallback(
    (action: ConversationReducerAction) => {
      setConversationReducerAction(action);
      touch();
    },
    [setConversationReducerAction, touch],
  );

  const dispatchToConversation = useCallback(
    (id: string, action: ConversationReducerAction) => {
      dispatchToConversationOnStore(store, id, action);
    },
    [store],
  );

  const markReadIfCurrent = useCallback(
    (id: string, runId: string) => {
      markReadIfCurrentOnStore(store, id, runId);
    },
    [store],
  );

  const dispatchLocal = useCallback(
    (action: ConversationReducerAction) => {
      setConversationReducerAction(action);
    },
    [setConversationReducerAction],
  );

  const { armPendingRun, executeChatRun, executeGenerateRun, retryRun, cancel } = useConversationRuns({
    streamGenerator: configRef.current.streamGenerator,
    chatStreamGenerator: configRef.current.chatStreamGenerator,
    dispatch,
    dispatchToConversation,
    markReadIfCurrent,
    readState,
    touch,
  });

  const handleCancel = useCallback(() => {
    const currentActiveRunId = readState().activeRunId;
    if (currentActiveRunId) {
      dispatch(["cancelRun", { runId: currentActiveRunId }]);
      // WHY: User cancel is always on the current conversation. Mark read
      // after cancelRun so navigating away does not surface this run as unread
      // (ASSISTANT-CHAT-CONVERSATIONS.md §Unread Status).
      setConversationReducerAction(["markRead", { runId: currentActiveRunId }]);
    }
    cancel();
  }, [dispatch, cancel, readState, setConversationReducerAction]);

  const handleReset = useCallback(() => {
    const stored = readLastUsed();
    const newId = newConversation(stored ?? undefined);
    onConversationIdChange(newId);
  }, [newConversation, onConversationIdChange, readLastUsed]);

  // WHY: On cold start, conversationId is undefined until the URL catches up.
  // We hold the locally-assigned id here so ensureConversationId can return
  // it synchronously before the router navigates.
  const localConversationIdRef = useRef<string | null>(conversationId ?? null);

  const ensureConversationId = useCallback(() => {
    if (conversationId) return conversationId;
    if (!localConversationIdRef.current) {
      const id = generateUUID();
      localConversationIdRef.current = id;
      const stored = readLastUsed();
      dispatch(["newConversation", { ...stored, id, createdAt: new Date() }]);
      onConversationIdChange(id);
    }
    return localConversationIdRef.current;
  }, [conversationId, onConversationIdChange, dispatch, readLastUsed]);

  const { handleGenerate, handleRetry, handleDismissGenerate, handleRevert, handleRestore } = useRunOrchestration({
    configRef,
    readState,
    dispatch,
    dispatchLocal,
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
  };
}
