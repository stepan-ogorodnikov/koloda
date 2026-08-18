import { getTextMessageContent } from "@koloda/ai";
import { generateUUID } from "@koloda/app";
import { AssistantDuplicateRunError } from "@koloda/assistant";
import type { AssistantCommand } from "@koloda/assistant";
import type { RefObject } from "react";
import { useCallback, useRef } from "react";
import type { AssistantConversationConfig } from "../state/assistant-conversation-config";
import { userMessageId } from "../state/assistant-messages";
import type { ConversationReducerAction, ConversationReducerState } from "../state/conversation-reducer";
import { findLatestErroredRun, getVisibleMessages, resolveRunMode } from "../state/conversation-reducer";
import { prepareRunRequest, toRetryCommand, toSubmitCommand } from "./prepare-run-request";

// INVARIANT: Session-only orchestration — UI talks to RunController; only `useAssistantSession` assembles these deps.
type UseRunOrchestrationOptions = {
  configRef: RefObject<AssistantConversationConfig>;
  readState: () => ConversationReducerState;
  dispatch: (action: ConversationReducerAction) => void;
  // WHY: Revert is visual/in-memory only and must not touch()
  // (`toPersistedState` omits revertState).
  dispatchLocal: (action: ConversationReducerAction) => void;
  rememberLastUsedAIProfile: (profileId: string, modelId: string) => void;
  cancelActiveRun: () => void;
  /** Sole engine ingress — submit/retry go through typed commands. */
  dispatchCommand: (command: AssistantCommand) => void | Promise<void>;
  ensureConversationId: () => string | undefined;
};

type UseRunOrchestrationReturn = {
  handleGenerate: (value?: string) => Promise<void>;
  handleRetry: (runId: string) => Promise<void>;
  handleDismissGenerate: () => void;
  handleRevert: (userMessageId: string, currentInputText: string) => string | null;
  handleRestore: () => string | null;
};

export function useRunOrchestration(options: UseRunOrchestrationOptions): UseRunOrchestrationReturn {
  const {
    configRef,
    readState,
    dispatch,
    dispatchLocal,
    rememberLastUsedAIProfile,
    cancelActiveRun,
    dispatchCommand,
    ensureConversationId,
  } = options;

  // WHY: Engine rejects duplicate runs, but same-tick double submit can still
  // dispatch two submitTurn actions before React disables the button.
  // Scoped per conversation so submitting on B is not blocked while A awaits.
  const isSubmitInFlightByConversationRef = useRef(new Set<string>());

  const handleRetry = useCallback(
    async (runId: string) => {
      const cfg = configRef.current;
      const currentState = readState();
      const conversationId = currentState.id;
      if (isSubmitInFlightByConversationRef.current.has(conversationId)) return;
      if (!resolveRunMode(currentState, runId)) return;

      // WHY: Retry is exposed only on the visible tail. The history sent
      // to the AI must mirror what the user sees, so filter out anything
      // hidden by revert before walking the message list.
      const visibleMessages = getVisibleMessages(currentState.messages, currentState.revertState);
      const userMessage = visibleMessages.find((m) => m.id === userMessageId(runId));
      const promptText = userMessage ? getTextMessageContent(userMessage) : "";

      isSubmitInFlightByConversationRef.current.add(conversationId);
      try {
        // WHY: Every retry is chat+tools, including historical cards-mode
        // runs — they may call propose_cards. Chat never resolves data
        // access; a stored v1 snapshot stays on the run record as inert
        // metadata (tools re-read current data).
        const stored = currentState.runs[runId]?.dataAccess;
        const prepared = prepareRunRequest(cfg, "chat", promptText, visibleMessages, currentState.runs);
        if (!prepared) return;

        rememberLastUsedAIProfile(cfg.profileId, cfg.modelId);

        // WHY: Capture conversation id at request time so a later UI switch
        // cannot retarget restart/stream ownership while retry is queued.
        await dispatchCommand(toRetryCommand(conversationId, runId, "chat", prepared, stored));
      } catch (error) {
        // WHY: Typed engine rejection — ignore; do not surface as a transport failure.
        if (error instanceof AssistantDuplicateRunError) return;
        throw error;
      } finally {
        isSubmitInFlightByConversationRef.current.delete(conversationId);
      }
    },
    [configRef, dispatchCommand, readState, rememberLastUsedAIProfile],
  );

  const handleDismissGenerate = useCallback(() => {
    const run = findLatestErroredRun(readState());
    if (run) dispatch(["dismissRunError", { runId: run.id }]);
  }, [readState, dispatch]);

  const handleGenerate = useCallback(
    async (value?: string) => {
      ensureConversationId();
      const cfg = configRef.current;
      let currentState = readState();

      // WHY: After ensureConversationId(), the conversation is in the store.
      // Use the state's id rather than the prop (which may be undefined on cold start).
      const activeConversationId = currentState.id;
      // WHY: Guard before commitRevert. After revert cancels an active stream,
      // the aborted execute* may still hold this conversation in the in-flight
      // set until it settles. Committing revert then early-returning would
      // permanently drop messages with no replacement run.
      if (isSubmitInFlightByConversationRef.current.has(activeConversationId)) return;

      // WHY: Revert is visual until the user submits a new prompt. Commit
      // it now so the hidden messages and their runs are actually
      // removed; the prompt then becomes the latest user message and
      // starts a fresh run. Re-read the state afterwards so the rest of
      // this handler sees the post-commit shape.
      if (currentState.revertState) {
        dispatch(["commitRevert"]);
        currentState = readState();
      }

      const promptText = (value ?? "").trim();

      isSubmitInFlightByConversationRef.current.add(activeConversationId);
      let submittedRunId: string | null = null;
      try {
        // WHY: Submit is always chat+tools. Cards injection is not resolved
        // here — propose_cards runs against current data when the model calls it.
        const prepared = prepareRunRequest(cfg, "chat", promptText, currentState.messages, currentState.runs);
        if (!prepared) return;

        const runId = generateUUID();

        rememberLastUsedAIProfile(cfg.profileId, cfg.modelId);

        // WHY: Accept the engine command first. A sync reject (duplicate/closed)
        // must not leave a streaming placeholder in the document.
        const pending = dispatchCommand(toSubmitCommand(activeConversationId, runId, prepared));
        // WHY: Atomic submit — one action so the store never briefly holds a
        // user message without its run, or a run without an assistant placeholder.
        dispatch([
          "submitTurn",
          {
            runId,
            text: promptText,
            mode: "chat",
            kind: "chat-text",
            assistantText: "",
            templateFields: prepared.templateFields,
            modelName: prepared.modelName,
          },
        ]);
        submittedRunId = runId;
        await pending;
      } catch (error) {
        if (submittedRunId) dispatch(["rollbackSubmitTurn", { runId: submittedRunId }]);
        // WHY: Typed engine rejection — ignore; do not surface as a transport failure.
        if (error instanceof AssistantDuplicateRunError) return;
        throw error;
      } finally {
        isSubmitInFlightByConversationRef.current.delete(activeConversationId);
      }
    },
    [configRef, ensureConversationId, dispatch, dispatchCommand, readState, rememberLastUsedAIProfile],
  );

  const handleRevert = useCallback(
    (userMessageId: string, currentInputText: string) => {
      const state = readState();
      const userMessage = state.messages.find((m) => m.id === userMessageId);
      if (!userMessage) return null;
      const promptText = getTextMessageContent(userMessage);
      if (!promptText) return null;

      // WHY: Revert is visual; the actual deletion happens on the next
      // prompt submit. We just set the in-memory revert state. Any active
      // stream is canceled because its run will be among the hidden
      // messages and must not keep streaming. Do not mirror the target
      // run's cards mode onto the conversation — new submits are always chat.
      cancelActiveRun();
      dispatchLocal([
        "setRevertState",
        {
          revertedToUserMessageId: userMessageId,
          preRevertInputText: currentInputText,
        },
      ]);
      return promptText;
    },
    [readState, cancelActiveRun, dispatchLocal],
  );

  const handleRestore = useCallback(() => {
    const state = readState();
    if (!state.revertState) return null;
    const text = state.revertState.preRevertInputText;
    dispatchLocal(["setRevertState", null]);
    return text;
  }, [readState, dispatchLocal]);

  return {
    handleGenerate,
    handleRetry,
    handleDismissGenerate,
    handleRevert,
    handleRestore,
  };
}
