import type { AIChatMode } from "@koloda/ai";
import { getTextMessageContent } from "@koloda/ai";
import { generateUUID } from "@koloda/app";
import { AssistantDuplicateRunError } from "@koloda/assistant";
import type { AssistantCommand } from "@koloda/assistant";
import { msg } from "@lingui/core/macro";
import type { RefObject } from "react";
import { useCallback, useRef } from "react";
import type { AssistantConversationConfig } from "../state/assistant-conversation-config";
import { getMessageRunId, userMessageId } from "../state/assistant-messages";
import type { ConversationReducerAction, ConversationReducerState } from "../state/conversation-reducer";
import { findLatestErroredRun, getVisibleMessages, resolveRunMode } from "../state/conversation-reducer";
import type { ResolveDataAccess } from "./data-access";
import { prepareRunRequest, toRetryCommand, toSubmitCommand } from "./prepare-run-request";

// INVARIANT: Session-only orchestration — UI talks to RunController; only `useAssistantSession` assembles these deps.
type UseRunOrchestrationOptions = {
  configRef: RefObject<AssistantConversationConfig>;
  readState: () => ConversationReducerState;
  dispatch: (action: ConversationReducerAction) => void;
  // WHY: Revert is visual/in-memory only and must not touch()
  // (`toPersistedState` omits revertState). Mode changes still go through setMode.
  dispatchLocal: (action: ConversationReducerAction) => void;
  rememberLastUsedAIProfile: (profileId: string, modelId: string) => void;
  cancelActiveRun: () => void;
  setMode: (mode: AIChatMode) => void;
  /** Sole engine ingress — submit/retry go through typed commands. */
  dispatchCommand: (command: AssistantCommand) => void | Promise<void>;
  ensureConversationId: () => string | undefined;
  resolveDataAccess: ResolveDataAccess;
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
    setMode,
    dispatchCommand,
    ensureConversationId,
    resolveDataAccess,
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
      const mode = resolveRunMode(currentState, runId);
      if (!mode) return;

      // WHY: Retry is exposed only on the visible tail. The history sent
      // to the AI must mirror what the user sees, so filter out anything
      // hidden by revert before walking the message list.
      const visibleMessages = getVisibleMessages(currentState.messages, currentState.revertState);
      const userMessage = visibleMessages.find((m) => m.id === userMessageId(runId));
      const promptText = userMessage ? getTextMessageContent(userMessage) : "";

      isSubmitInFlightByConversationRef.current.add(conversationId);
      try {
        // WHY: Cards retry replays the run's submit-time snapshot unchanged —
        // deck edits since submit must not leak into the retried request.
        // Pre-feature cards runs without one resolve fresh inside the in-flight
        // guard. Chat never resolves: tools re-read current data; a stored v1
        // snapshot stays on the run record as inert metadata.
        const stored = currentState.runs[runId]?.dataAccess;
        const dataAccess = mode === "cards" ? (stored ?? (await resolveDataAccess(mode, currentState.deckId))) : stored;
        const prepared = prepareRunRequest(
          cfg,
          mode,
          promptText,
          visibleMessages,
          currentState.runs,
          mode === "cards" ? dataAccess : undefined,
        );
        if (!prepared) return;

        rememberLastUsedAIProfile(cfg.profileId, cfg.modelId);

        // WHY: Capture conversation id at request time so a later UI switch
        // cannot retarget restart/stream ownership while retry is queued.
        // The snapshot rides the command so restart stores it on the run
        // record — cards later retries replay it; chat keeps inert metadata.
        await dispatchCommand(toRetryCommand(conversationId, runId, mode, prepared, dataAccess));
      } catch (error) {
        // WHY: Typed engine rejection — ignore; do not surface as a transport failure.
        if (error instanceof AssistantDuplicateRunError) return;
        throw error;
      } finally {
        isSubmitInFlightByConversationRef.current.delete(conversationId);
      }
    },
    [configRef, dispatchCommand, readState, rememberLastUsedAIProfile, resolveDataAccess],
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

      const currentMode = currentState.mode;

      const promptText = (value ?? "").trim();

      isSubmitInFlightByConversationRef.current.add(activeConversationId);
      let submittedRunId: string | null = null;
      try {
        // WHY: Cards resolve exactly once per submit, inside the in-flight
        // guard — the await would otherwise re-open the same-tick double-submit
        // window. Chat discovers decks/cards via tools and must not store a
        // new snapshot (old chat snapshots stay inert on restored runs).
        const dataAccess =
          currentMode === "cards" ? await resolveDataAccess(currentMode, currentState.deckId) : undefined;
        const prepared = prepareRunRequest(
          cfg,
          currentMode,
          promptText,
          currentState.messages,
          currentState.runs,
          dataAccess,
        );
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
            mode: prepared.kind,
            kind: prepared.kind === "chat" ? "chat-text" : "generated-cards",
            assistantText: prepared.kind === "chat" ? "" : cfg._(msg`assistant.chat.message.status.pending`),
            templateFields: prepared.templateFields,
            modelName: prepared.modelName,
            dataAccess,
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
    [
      configRef,
      ensureConversationId,
      dispatch,
      dispatchCommand,
      readState,
      rememberLastUsedAIProfile,
      resolveDataAccess,
    ],
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
      // messages and must not keep streaming.
      cancelActiveRun();
      dispatchLocal([
        "setRevertState",
        {
          revertedToUserMessageId: userMessageId,
          preRevertInputText: currentInputText,
        },
      ]);
      // WHY: Mirror the mode of the target message so the prompt input
      // lines up with what the run was sent in. Use setMode (bumps save)
      // rather than a raw setMode dispatch so the change persists.
      const runId = getMessageRunId(userMessage);
      const targetMode = runId ? resolveRunMode(state, runId) : null;
      if (targetMode && targetMode !== state.mode) {
        setMode(targetMode);
      }
      return promptText;
    },
    [readState, cancelActiveRun, dispatchLocal, setMode],
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
