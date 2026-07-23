import type { AIChatMode, GeneratedCard, ModelParameter, StreamUsage } from "@koloda/ai";
import { dispatchReducerAction, type ReducerAction } from "@koloda/core-react";
import type { TemplateFields } from "@koloda/srs";
import type { UIMessage } from "ai";
import { produce } from "immer";
import {
  assistantMessageId,
  createTextMessage,
  getAssistantMetadata,
  getRunIdFromMessageId,
  modeToMessageKind,
  userMessageId,
} from "./assistant-messages";

export type CardStatus = "idle" | "pending" | "success" | "error";

export type RunStatus = "streaming" | "success" | "failed" | "canceled";

export type GenerationRun = {
  id: string;
  mode: AIChatMode;
  status: RunStatus;
  cards: GeneratedCard[];
  cardStatuses: Record<number, CardStatus>;
  templateFields: TemplateFields | null;
  request?: unknown;
  error?: { message: string };
  startedAt: Date;
  elapsedSeconds: number | null;
  modelName?: string;
  usage?: StreamUsage;
};

export type RevertState = {
  revertedToUserMessageId: string;
  preRevertInputText: string;
};

export type ConversationReducerState = {
  id: string;
  createdAt: Date;
  updatedAt: Date | null;
  messages: UIMessage[];
  runs: Record<string, GenerationRun>;
  activeRunId: string | null;
  dismissedRunErrorId: string | null;
  mode: AIChatMode;
  deckId: number | null;
  profileId: string | null;
  modelId: string | null;
  modelParameters: Partial<Record<ModelParameter["type"], string>>;
  // INVARIANT: A conversation is unread when its latest non-streaming
  // run's id differs from this pointer. The pointer is cleared when the
  // referenced run is dropped so the unread predicate stays correct.
  lastReadRunId: string | null;
  revertState: RevertState | null;
};

export const initialConversationState: ConversationReducerState = {
  id: "",
  createdAt: new Date(0),
  updatedAt: null,
  messages: [],
  runs: {},
  activeRunId: null,
  dismissedRunErrorId: null,
  mode: "chat",
  deckId: null,
  profileId: null,
  modelId: null,
  modelParameters: {},
  lastReadRunId: null,
  revertState: null,
};

const actions = {
  addUserMessage,
  addAssistantMessage,
  updateAssistantText,
  startRun,
  addCard,
  setCardStatus,
  completeRun,
  runFailed,
  cancelRun,
  restartRun,
  setUsage,
  setMode,
  setDeck,
  setAIProfile,
  setAIModel,
  setAIModelParameter,
  dismissRunError,
  markRead,
  newConversation,
  setRevertState,
  commitRevert,
};

export type ConversationReducerAction = ReducerAction<typeof actions, ConversationReducerState>;

// WHY: With revert active, the target user message and everything after
// it must be hidden from the UI. The conversation state still holds the
// full message list; this function returns the user-visible prefix.
export function getVisibleMessages(messages: UIMessage[], revertState: RevertState | null): UIMessage[] {
  if (!revertState) return messages;
  const userMessageIndex = messages.findIndex((m) => m.id === revertState.revertedToUserMessageId);
  if (userMessageIndex === -1) return messages;

  return messages.slice(0, userMessageIndex);
}

function makeRun(
  runId: string,
  mode: AIChatMode,
  templateFields: TemplateFields | null | undefined,
  modelName?: string,
  request?: unknown,
): GenerationRun {
  return {
    id: runId,
    mode,
    status: "streaming",
    cards: [],
    cardStatuses: {},
    templateFields: templateFields ?? null,
    request,
    startedAt: new Date(),
    elapsedSeconds: null,
    modelName,
  };
}

/**
 * WHY: `cloneConversationAtom` and restore-time normalization both
 * need to drop a set of run ids together with their user/assistant
 * message pair. The user/assistant ids encode the run id (`user-<id>`,
 * `assistant-<id>`), so the filtering rules live in one place here.
 */
export function dropRuns(
  state: ConversationReducerState,
  droppedRunIds: ReadonlySet<string>,
): { messages: UIMessage[]; runs: Record<string, GenerationRun> } {
  const messages = state.messages.filter((m) => {
    const runId = getRunIdFromMessageId(m.id);
    return !runId || !droppedRunIds.has(runId);
  });
  const runs: Record<string, GenerationRun> = {};
  for (const [runId, run] of Object.entries(state.runs)) {
    if (!droppedRunIds.has(runId)) runs[runId] = run;
  }
  return { messages, runs };
}

export function resolveRunMode(state: ConversationReducerState, runId: string): AIChatMode | null {
  const run = state.runs[runId];
  if (run) return run.mode;

  const assistantMessage = state.messages.find((m) => m.id === assistantMessageId(runId));
  if (!assistantMessage) return null;
  const metadata = getAssistantMetadata(assistantMessage);
  if (!metadata) return null;
  if (metadata.kind === "error") return metadata.mode;
  if (metadata.kind === "generated-cards") return "cards";
  if (metadata.kind === "chat-text") return "chat";
  return null;
}

/** Latest failed run that has not been dismissed, or null. */
export function findLatestErroredRun(state: ConversationReducerState): GenerationRun | null {
  const ids = Object.keys(state.runs);
  for (let i = ids.length - 1; i >= 0; i--) {
    const run = state.runs[ids[i]];
    if (run && run.status === "failed" && run.id !== state.dismissedRunErrorId) {
      return run;
    }
  }
  return null;
}

function finishRun(draft: ConversationReducerState, runId: string, status: RunStatus) {
  const run = draft.runs[runId];
  if (!run) return;
  run.status = status;
  run.elapsedSeconds = Math.floor((Date.now() - run.startedAt.getTime()) / 1000);
}

function clearActiveIfRun(draft: ConversationReducerState, runId: string) {
  if (draft.activeRunId === runId) draft.activeRunId = null;
}

type AddUserMessagePayload = { runId: string; text: string };

function addUserMessage(draft: ConversationReducerState, payload: AddUserMessagePayload) {
  draft.messages.push(
    createTextMessage(userMessageId(payload.runId), "user", payload.text, { createdAt: new Date().toISOString() }),
  );
}

type AddAssistantMessagePayload = { runId: string; kind: "chat-text" | "generated-cards"; text: string };

function addAssistantMessage(draft: ConversationReducerState, payload: AddAssistantMessagePayload) {
  draft.messages.push(
    createTextMessage(assistantMessageId(payload.runId), "assistant", payload.text, {
      kind: payload.kind,
      runId: payload.runId,
    }),
  );
}

type UpdateAssistantTextPayload = { runId: string; text: string };

function updateAssistantText(draft: ConversationReducerState, payload: UpdateAssistantTextPayload) {
  const msg = draft.messages.find((m) => m.id === assistantMessageId(payload.runId));
  if (msg) {
    msg.parts = [{ type: "text" as const, text: payload.text }];
  }
}

type StartRunPayload = {
  runId: string;
  mode: AIChatMode;
  request: unknown;
  templateFields?: TemplateFields | null;
  modelName?: string;
};

function startRun(draft: ConversationReducerState, payload: StartRunPayload) {
  draft.activeRunId = payload.runId;
  draft.runs[payload.runId] = makeRun(
    payload.runId,
    payload.mode,
    payload.templateFields,
    payload.modelName,
    payload.request,
  );
}

type AddCardPayload = { runId: string; card: GeneratedCard };

function addCard(draft: ConversationReducerState, payload: AddCardPayload) {
  const run = draft.runs[payload.runId];
  if (!run) return;
  run.cards.push(payload.card);
  run.cardStatuses[run.cards.length - 1] = "idle";
}

type SetCardStatusPayload = { runId: string; index: number; status: CardStatus };

function setCardStatus(draft: ConversationReducerState, payload: SetCardStatusPayload) {
  const run = draft.runs[payload.runId];
  if (run) run.cardStatuses[payload.index] = payload.status;
}

type RunIdPayload = { runId: string };

function completeRun(draft: ConversationReducerState, payload: RunIdPayload) {
  finishRun(draft, payload.runId, "success");
  clearActiveIfRun(draft, payload.runId);
  const run = draft.runs[payload.runId];
  if (run) run.error = undefined;
}

type RunFailedPayload = { runId: string; error: { message: string } };

function runFailed(draft: ConversationReducerState, payload: RunFailedPayload) {
  finishRun(draft, payload.runId, "failed");
  const run = draft.runs[payload.runId];
  if (run) run.error = payload.error;
  clearActiveIfRun(draft, payload.runId);
}

function cancelRun(draft: ConversationReducerState, payload: RunIdPayload) {
  finishRun(draft, payload.runId, "canceled");
  clearActiveIfRun(draft, payload.runId);
}

type RestartRunPayload = {
  runId: string;
  request: unknown;
  templateFields: TemplateFields | null;
  mode: AIChatMode;
  modelName?: string;
};

function restartRun(draft: ConversationReducerState, payload: RestartRunPayload) {
  const existing = draft.runs[payload.runId];
  if (existing) {
    existing.status = "streaming";
    existing.cards = [];
    existing.cardStatuses = {};
    existing.request = payload.request;
    existing.templateFields = payload.templateFields;
    existing.startedAt = new Date();
    existing.elapsedSeconds = null;
    existing.modelName = payload.modelName !== undefined ? payload.modelName : existing.modelName;
    existing.usage = undefined;
    existing.error = undefined;
  } else {
    draft.runs[payload.runId] = makeRun(
      payload.runId,
      payload.mode,
      payload.templateFields,
      payload.modelName,
      payload.request,
    );
    // Fix up the error→assistant message if it existed
    const msg = draft.messages.find((m) => m.id === assistantMessageId(payload.runId));
    if (msg) {
      const metadata = getAssistantMetadata(msg);
      if (metadata?.kind === "error") {
        msg.metadata = {
          kind: modeToMessageKind(payload.mode),
          runId: payload.runId,
        };
      }
    }
  }
  draft.activeRunId = payload.runId;
}

type SetUsagePayload = { runId: string; usage: StreamUsage };

function setUsage(draft: ConversationReducerState, payload: SetUsagePayload) {
  const run = draft.runs[payload.runId];
  if (run) run.usage = payload.usage;
}

type SetModePayload = { mode: AIChatMode };

function setMode(draft: ConversationReducerState, payload: SetModePayload) {
  draft.mode = payload.mode;
}

type SetDeckPayload = { deckId: number | null };

function setDeck(draft: ConversationReducerState, payload: SetDeckPayload) {
  draft.deckId = payload.deckId;
}

type SetAIProfilePayload = {
  profileId: string | null;
  modelId: string | null;
  modelParameters?: Partial<Record<ModelParameter["type"], string>>;
};

// WHY: `setAIProfile` resets profileId + model + params; `setAIModel` writes
// model + params while preserving the existing profileId. The two action
// names/payloads stay separate (the preserve-vs-reset distinction is
// load-bearing for the profile→model dependency) but share this assignment
// helper so the `modelParameters ?? {}` defaulting logic lives in one place.
type ApplyAIConfigOptions = {
  profileId?: string | null;
  modelId: string | null;
  modelParameters?: Partial<Record<ModelParameter["type"], string>>;
};

function applyAIConfig(draft: ConversationReducerState, config: ApplyAIConfigOptions) {
  if (config.profileId !== undefined) draft.profileId = config.profileId;
  draft.modelId = config.modelId;
  draft.modelParameters = config.modelParameters ?? {};
}

function setAIProfile(draft: ConversationReducerState, payload: SetAIProfilePayload) {
  applyAIConfig(draft, payload);
}

type SetAIModelPayload = {
  modelId: string | null;
  modelParameters?: Partial<Record<ModelParameter["type"], string>>;
};

function setAIModel(draft: ConversationReducerState, payload: SetAIModelPayload) {
  applyAIConfig(draft, payload);
}

type SetAIModelParameterPayload = { paramType: ModelParameter["type"]; value: string | null };

function setAIModelParameter(draft: ConversationReducerState, payload: SetAIModelParameterPayload) {
  if (payload.value === null || payload.value === "") {
    delete draft.modelParameters[payload.paramType];
  } else {
    draft.modelParameters[payload.paramType] = payload.value;
  }
}

function dismissRunError(draft: ConversationReducerState, payload: RunIdPayload) {
  draft.dismissedRunErrorId = payload.runId;
}

function markRead(draft: ConversationReducerState, payload: RunIdPayload) {
  if (!draft.runs[payload.runId]) return;
  if (draft.lastReadRunId === payload.runId) return;
  draft.lastReadRunId = payload.runId;
}

type NewConversationPayload = {
  id: string;
  createdAt: Date;
  profileId?: string | null;
  modelId?: string | null;
  modelParameters?: Partial<Record<ModelParameter["type"], string>>;
};

function newConversation(draft: ConversationReducerState, payload: NewConversationPayload) {
  draft.id = payload.id;
  draft.createdAt = payload.createdAt;
  draft.updatedAt = null;
  draft.messages = [];
  draft.runs = {};
  draft.activeRunId = null;
  draft.dismissedRunErrorId = null;
  draft.mode = "chat";
  draft.deckId = null;
  draft.profileId = payload.profileId ?? null;
  draft.modelId = payload.modelId ?? null;
  draft.modelParameters = payload.modelParameters ?? {};
  draft.lastReadRunId = null;
  draft.revertState = null;
}

// WHY: The payload is the revert state itself (not a wrapper object) so
// `["setRevertState", null]` reads as "clear revert" — same call site as
// `["setRevertState", someRevertState]` reads as "set revert to this".
function setRevertState(draft: ConversationReducerState, payload: RevertState | null) {
  if (draft.revertState === payload) return;
  draft.revertState = payload;
}

function commitRevert(draft: ConversationReducerState) {
  if (!draft.revertState) return;
  const { revertedToUserMessageId } = draft.revertState;
  const userMessageIndex = draft.messages.findIndex((m) => m.id === revertedToUserMessageId);
  if (userMessageIndex === -1) {
    // WHY: Stale revert state (target message was removed by some
    // other path). Clear the revert state so the UI stops hiding
    // nothing; nothing actually needs deleting.
    draft.revertState = null;
    return;
  }

  draft.messages = draft.messages.slice(0, userMessageIndex);

  const survivingRunIds = new Set<string>();
  for (const m of draft.messages) {
    const runId = getRunIdFromMessageId(m.id);
    if (runId) survivingRunIds.add(runId);
  }
  for (const id of Object.keys(draft.runs)) {
    if (!survivingRunIds.has(id)) delete draft.runs[id];
  }

  if (draft.lastReadRunId !== null && !(draft.lastReadRunId in draft.runs)) {
    draft.lastReadRunId = null;
  }
  draft.activeRunId = null;
  draft.dismissedRunErrorId = null;
  draft.revertState = null;
}

export function conversationReducer(state: ConversationReducerState, action: ConversationReducerAction) {
  return produce(state, (draft) => {
    dispatchReducerAction(draft as ConversationReducerState, actions, action);
  });
}
