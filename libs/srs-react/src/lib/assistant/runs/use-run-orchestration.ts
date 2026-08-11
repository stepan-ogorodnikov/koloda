import type { AIChatMode, ChatStreamRequest } from "@koloda/ai";
import { getTextMessageContent } from "@koloda/ai";
import type { CardGenerationStreamRequest } from "@koloda/ai-react";
import { generateUUID } from "@koloda/app";
import { AssistantDuplicateRunError, type AssistantExecutionIdentity } from "@koloda/assistant";
import type { TemplateFields } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import type { RefObject } from "react";
import { useCallback, useRef } from "react";
import type { AssistantConversationConfig } from "../state/assistant-conversation-config";
import { buildConversationMessages, getMessageRunId, userMessageId } from "../state/assistant-messages";
import type { ConversationReducerAction, ConversationReducerState, GenerationRun } from "../state/conversation-reducer";
import { findLatestErroredRun, getVisibleMessages, resolveRunMode } from "../state/conversation-reducer";
import type { StreamRequestResult } from "./build-stream-request";
import { buildStreamRequest } from "./build-stream-request";

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
  executeChatRun: (
    conversationId: string,
    runId: string,
    request: ChatStreamRequest,
    execution: AssistantExecutionIdentity,
  ) => Promise<void>;
  executeGenerateRun: (
    conversationId: string,
    runId: string,
    request: CardGenerationStreamRequest,
    execution: AssistantExecutionIdentity,
  ) => Promise<void>;
  retryRun: (
    conversationId: string,
    runId: string,
    request: ChatStreamRequest | CardGenerationStreamRequest,
    templateFields: TemplateFields | null,
    mode: AIChatMode,
    modelName: string | undefined,
    execution: AssistantExecutionIdentity,
  ) => Promise<void>;
  ensureConversationId: () => string | undefined;
};

type UseRunOrchestrationReturn = {
  handleGenerate: (value?: string) => Promise<void>;
  handleRetry: (runId: string) => Promise<void>;
  handleDismissGenerate: () => void;
  handleRevert: (userMessageId: string, currentInputText: string) => string | null;
  handleRestore: () => string | null;
};

type PreparedRun = StreamRequestResult & { modelName: string | undefined };

function createExecutionIdentity(
  cfg: AssistantConversationConfig,
  kind: PreparedRun["kind"],
): AssistantExecutionIdentity {
  if (kind !== "cards") return { profileId: cfg.profileId };

  const template = cfg.template;
  if (!template) throw new Error("Card generation requires a template");
  return {
    profileId: cfg.profileId,
    template: {
      id: template.id,
      content: { fields: template.content.fields },
    },
  };
}

/**
 * Shared guard + request builder for a new run. Returns `null` when the
 * prompt/config is invalid, so callers early-return *before* starting a
 * stream. Centralizing the guard stack here is what lets `handleRetry`
 * execute only after validation.
 */
function prepareRunRequest(
  cfg: AssistantConversationConfig,
  mode: AIChatMode,
  promptText: string,
  messages: ConversationReducerState["messages"],
  runs: Record<string, GenerationRun>,
): PreparedRun | null {
  if (!promptText || !cfg.profileId || !cfg.modelId) return null;
  if (mode === "cards" && !cfg.template) return null;

  const conversationMessages = buildConversationMessages(messages, runs, cfg.template);
  const result = buildStreamRequest(cfg, mode, promptText, conversationMessages);
  return { ...result, modelName: cfg.modelName };
}

export function useRunOrchestration(options: UseRunOrchestrationOptions): UseRunOrchestrationReturn {
  const {
    configRef,
    readState,
    dispatch,
    dispatchLocal,
    rememberLastUsedAIProfile,
    cancelActiveRun,
    setMode,
    executeChatRun,
    executeGenerateRun,
    retryRun,
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
      const mode = resolveRunMode(currentState, runId);
      if (!mode) return;

      // WHY: Retry is exposed only on the visible tail. The history sent
      // to the AI must mirror what the user sees, so filter out anything
      // hidden by revert before walking the message list.
      const visibleMessages = getVisibleMessages(currentState.messages, currentState.revertState);
      const userMessage = visibleMessages.find((m) => m.id === userMessageId(runId));
      const promptText = userMessage ? getTextMessageContent(userMessage) : "";

      const prepared = prepareRunRequest(cfg, mode, promptText, visibleMessages, currentState.runs);
      if (!prepared) return;
      const execution = createExecutionIdentity(cfg, prepared.kind);

      rememberLastUsedAIProfile(cfg.profileId, cfg.modelId);

      isSubmitInFlightByConversationRef.current.add(conversationId);
      try {
        // WHY: Capture conversation id at request time so a later UI switch
        // cannot retarget restart/stream ownership while retry is queued.
        await retryRun(
          conversationId,
          runId,
          prepared.request,
          prepared.templateFields,
          mode,
          prepared.modelName,
          execution,
        );
      } catch (error) {
        // WHY: Typed engine rejection — ignore; do not surface as a transport failure.
        if (error instanceof AssistantDuplicateRunError) return;
        throw error;
      } finally {
        isSubmitInFlightByConversationRef.current.delete(conversationId);
      }
    },
    [configRef, retryRun, readState, rememberLastUsedAIProfile],
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

      const prepared = prepareRunRequest(cfg, currentMode, promptText, currentState.messages, currentState.runs);
      if (!prepared) return;
      const execution = createExecutionIdentity(cfg, prepared.kind);

      const runId = generateUUID();

      rememberLastUsedAIProfile(cfg.profileId, cfg.modelId);

      isSubmitInFlightByConversationRef.current.add(activeConversationId);
      try {
        // WHY: Atomic submit — one command so the store never briefly holds a
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
          },
        ]);

        if (prepared.kind === "chat") {
          await executeChatRun(activeConversationId, runId, prepared.request, execution);
        } else {
          await executeGenerateRun(activeConversationId, runId, prepared.request, execution);
        }
      } catch (error) {
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
      executeChatRun,
      executeGenerateRun,
      readState,
      rememberLastUsedAIProfile,
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
