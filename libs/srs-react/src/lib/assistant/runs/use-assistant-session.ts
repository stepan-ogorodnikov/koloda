import type { ModelParameter } from "@koloda/ai";
import { generateUUID } from "@koloda/app";
import type { Template } from "@koloda/srs";
import { useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useRef } from "react";
import { aiProfileStateAtom } from "../state/ai-profile-state";
import { newConversationAtom, setAssistantModeAtom } from "../state/conversation-actions";
import type { ConversationReducerAction } from "../state/conversation-reducer";
import { assistantConversationStateAtom, touchAtom } from "../state/conversation-store";
import { useAssistantRuntimeConfig } from "../use-assistant-runtime-config";
import { useRememberLastUsedAIProfile } from "../use-global-ai-profile-state";
import type { RunController } from "./run-controller";
import { useConversationRuns } from "./use-conversation-runs";
import { useRunOrchestration } from "./use-run-orchestration";

export type UseAssistantSessionOptions = {
  conversationId: string | undefined;
  onConversationIdChange: (id: string) => void;
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  modelParameters: ModelParameter[];
};

export type UseAssistantSessionReturn = {
  controller: RunController;
  template: Template | null | undefined;
  templateId: Template["id"] | undefined;
};

export function useAssistantSession({
  conversationId,
  onConversationIdChange,
  profileId,
  modelId,
  modelName,
  modelParameters,
}: UseAssistantSessionOptions): UseAssistantSessionReturn {
  const setConversationReducerAction = useSetAtom(assistantConversationStateAtom);
  const setMode = useSetAtom(setAssistantModeAtom);
  const touch = useSetAtom(touchAtom);
  const newConversation = useSetAtom(newConversationAtom);
  const rememberLastUsedAIProfile = useRememberLastUsedAIProfile();

  const reasoningEffort = modelParameters.find((p) => p.type === "reasoning_effort")?.value ?? "";

  const { template, templateId, configRef } = useAssistantRuntimeConfig({
    profileId,
    modelId,
    modelName,
    reasoningEffort,
  });

  const readState = useAtomCallback((get) => get(assistantConversationStateAtom));
  const readLastUsed = useAtomCallback((get) => get(aiProfileStateAtom));

  // WHY: Keep three named helpers (dispatch / by-id / local) instead of
  // one options-bag. Collapsing them makes it easy to touch on stream
  // chunks or persist in-memory revertState. `dispatchToConversation`
  // never auto-touches — stream chunks and terminal success/failure/abort
  // call `touch(conversationId)` explicitly in the assistant engine.
  const dispatch = useCallback(
    (action: ConversationReducerAction) => {
      setConversationReducerAction(action);
      touch();
    },
    [setConversationReducerAction, touch],
  );

  const dispatchLocal = useCallback(
    (action: ConversationReducerAction) => {
      setConversationReducerAction(action);
    },
    [setConversationReducerAction],
  );

  const { dispatch: dispatchCommand } = useConversationRuns();

  const handleCancel = useCallback(() => {
    const state = readState();
    const currentActiveRunId = state.activeRunId;
    if (!currentActiveRunId) return;
    const run = state.runs[currentActiveRunId];
    dispatch(["cancelRun", { runId: currentActiveRunId }]);
    // WHY: User cancel is always on the current conversation. Mark read
    // after cancelRun so navigating away does not surface this run as unread
    // (ASSISTANT-CHAT-CONVERSATIONS.md §Unread Status).
    setConversationReducerAction(["markRead", { runId: currentActiveRunId }]);
    // WHY: Abort only this run's controller. Other conversations can stream
    // concurrently (same or different mode); canceling must not kill them.
    if (run) dispatchCommand({ type: "cancel", conversationId: state.id, runId: currentActiveRunId });
  }, [dispatch, dispatchCommand, readState, setConversationReducerAction]);

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

  const orchestrationOptions = {
    configRef,
    readState,
    dispatch,
    dispatchLocal,
    rememberLastUsedAIProfile,
    cancelActiveRun: handleCancel,
    setMode,
    dispatchCommand,
    ensureConversationId,
  };
  const { handleGenerate, handleRetry, handleDismissGenerate, handleRevert, handleRestore } =
    useRunOrchestration(orchestrationOptions);

  const controller: RunController = {
    submit: handleGenerate,
    retry: handleRetry,
    cancel: handleCancel,
    reset: handleReset,
    revert: handleRevert,
    restore: handleRestore,
    dismissGenerate: handleDismissGenerate,
    setMode,
  };

  return { controller, template, templateId };
}
