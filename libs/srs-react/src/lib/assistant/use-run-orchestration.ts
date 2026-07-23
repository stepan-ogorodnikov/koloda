import type { AIChatMode, ChatStreamRequest } from "@koloda/ai";
import { getTextMessageContent } from "@koloda/ai";
import type { CardGenerationStreamRequest } from "@koloda/ai-react";
import { generateUUID } from "@koloda/app";
import type { TemplateFields } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useCallback } from "react";
import type { RefObject } from "react";
import type { AIProfileStateUpdater } from "./ai-profile-state";
import type { AssistantConversationConfig } from "./assistant-conversation-config";
import { buildConversationMessages, getRunIdFromMessageId, userMessageId } from "./assistant-messages";
import { type StreamRequestResult, buildStreamRequest } from "./build-stream-request";
import { findLatestErroredRun, getVisibleMessages, resolveRunMode } from "./conversation-reducer";
import type { ConversationReducerAction, ConversationReducerState, GenerationRun } from "./conversation-reducer";

export type UseRunOrchestrationOptions = {
  configRef: RefObject<AssistantConversationConfig>;
  readState: () => ConversationReducerState;
  dispatchPersisted: (action: ConversationReducerAction) => void;
  // WHY: Revert is visual/in-memory only and must not bump pending save
  // (persist strips revertState). Mode changes still go through setMode.
  dispatchEphemeral: (action: ConversationReducerAction) => void;
  setGlobalAIProfileState: (updater: AIProfileStateUpdater) => void;
  cancelActiveRun: () => void;
  setMode: (mode: AIChatMode) => void;
  executeChatRun: (conversationId: string, runId: string, request: ChatStreamRequest) => Promise<void>;
  executeGenerateRun: (conversationId: string, runId: string, request: CardGenerationStreamRequest) => Promise<void>;
  retryRun: (
    runId: string,
    request: ChatStreamRequest | CardGenerationStreamRequest,
    templateFields: TemplateFields | null,
    mode: AIChatMode,
    modelName?: string,
  ) => Promise<void>;
  ensureConversationId: () => string | undefined;
  armPendingRun: (mode: AIChatMode, conversationId: string, runId: string) => void;
};

export type UseRunOrchestrationReturn = {
  handleGenerate: (value?: string) => Promise<void>;
  handleRetry: (runId: string) => Promise<void>;
  handleDismissGenerate: () => void;
  handleRevert: (userMessageId: string, currentInputText: string) => string | null;
  handleRestore: () => string | null;
};

type PreparedRun = StreamRequestResult & { modelName: string | undefined };

/**
 * Shared guard + request builder for a new run. Returns `null` when the
 * prompt/config is invalid, so callers early-return *before* arming a
 * pending-run ref or starting a stream. Centralizing the guard stack here
 * is what lets `handleRetry` arm only after validation (see comment there).
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

/**
 * Dispatches the `startRun` + `addAssistantMessage` pair that opens a
 * freshly-generated run. The only chat-vs-cards difference is the
 * assistant placeholder text: "" for chat, the cards "pending" status
 * message otherwise.
 */
function dispatchStartRun(
  dispatch: (action: ConversationReducerAction) => void,
  cfg: AssistantConversationConfig,
  runId: string,
  prepared: PreparedRun,
) {
  dispatch([
    "startRun",
    {
      runId,
      mode: prepared.kind,
      request: prepared.request,
      templateFields: prepared.templateFields,
      modelName: prepared.modelName,
    },
  ]);
  dispatch([
    "addAssistantMessage",
    {
      runId,
      kind: prepared.kind === "chat" ? "chat-text" : "generated-cards",
      text: prepared.kind === "chat" ? "" : cfg._(msg`assistant.chat.message.status.pending`),
    },
  ]);
}

export function useRunOrchestration({
  configRef,
  readState,
  dispatchPersisted,
  dispatchEphemeral,
  setGlobalAIProfileState,
  cancelActiveRun,
  setMode,
  executeChatRun,
  executeGenerateRun,
  retryRun,
  ensureConversationId,
  armPendingRun,
}: UseRunOrchestrationOptions): UseRunOrchestrationReturn {
  const handleRetry = useCallback(
    async (runId: string) => {
      const cfg = configRef.current;
      const currentState = readState();
      const conversationId = currentState.id;
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

      // WHY: Arm the pending-run ref only after validation. The ref routes
      // a stream failure back to this runId; arming before the guards left
      // a dangling error route armed whenever a retry was invalid (no
      // prompt/profile/model/template), since no stream would ever start to
      // clear the ref via `onComplete`. Prepare → arm → dispatch/execute.
      armPendingRun(mode, conversationId, runId);

      setGlobalAIProfileState(cfg);

      await retryRun(runId, prepared.request, prepared.templateFields, mode, prepared.modelName);
    },
    [configRef, retryRun, readState, setGlobalAIProfileState, armPendingRun],
  );

  const handleDismissGenerate = useCallback(() => {
    const run = findLatestErroredRun(readState());
    if (run) dispatchPersisted(["dismissRunError", { runId: run.id }]);
  }, [readState, dispatchPersisted]);

  const handleGenerate = useCallback(
    async (value?: string) => {
      ensureConversationId();
      const cfg = configRef.current;
      let currentState = readState();

      // WHY: Revert is visual until the user submits a new prompt. Commit
      // it now so the hidden messages and their runs are actually
      // removed; the prompt then becomes the latest user message and
      // starts a fresh run. Re-read the state afterwards so the rest of
      // this handler sees the post-commit shape.
      if (currentState.revertState) {
        dispatchPersisted(["commitRevert"]);
        currentState = readState();
      }

      const currentMode = currentState.mode;

      const promptText = (value ?? "").trim();

      const prepared = prepareRunRequest(cfg, currentMode, promptText, currentState.messages, currentState.runs);
      if (!prepared) return;

      const runId = generateUUID();
      // WHY: After ensureConversationId(), the conversation is in the store.
      // Use the state's id rather than the prop (which may be undefined on cold start).
      const activeConversationId = readState().id;
      armPendingRun(currentMode, activeConversationId, runId);

      setGlobalAIProfileState(cfg);

      dispatchPersisted(["addUserMessage", { runId, text: promptText }]);
      dispatchStartRun(dispatchPersisted, cfg, runId, prepared);

      if (prepared.kind === "chat") {
        await executeChatRun(activeConversationId, runId, prepared.request);
      } else {
        await executeGenerateRun(activeConversationId, runId, prepared.request);
      }
    },
    [
      configRef,
      ensureConversationId,
      dispatchPersisted,
      executeChatRun,
      executeGenerateRun,
      readState,
      setGlobalAIProfileState,
      armPendingRun,
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
      dispatchEphemeral([
        "setRevertState",
        { revertedToUserMessageId: userMessageId, preRevertInputText: currentInputText },
      ]);
      // WHY: Mirror the mode of the target message so the prompt input
      // lines up with what the run was sent in. Use setMode (bumps save)
      // rather than a raw setMode dispatch so the change persists.
      const runId = getRunIdFromMessageId(userMessageId);
      const targetMode = runId ? resolveRunMode(state, runId) : null;
      if (targetMode && targetMode !== state.mode) {
        setMode(targetMode);
      }
      return promptText;
    },
    [readState, cancelActiveRun, dispatchEphemeral, setMode],
  );

  const handleRestore = useCallback(() => {
    const state = readState();
    if (!state.revertState) return null;
    const text = state.revertState.preRevertInputText;
    dispatchEphemeral(["setRevertState", null]);
    return text;
  }, [readState, dispatchEphemeral]);

  return { handleGenerate, handleRetry, handleDismissGenerate, handleRevert, handleRestore };
}
