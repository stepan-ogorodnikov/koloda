import { generatedCardsFromProposeOutput, isProposeCardsOutput } from "@koloda/ai";
import type { GeneratedCard, ModelParameter } from "@koloda/ai";
import { dispatchReducerAction } from "@koloda/core-react";
import type { ReducerAction } from "@koloda/core-react";
import { produce } from "immer";
import { getMessageRunId } from "./assistant-messages";
import type {
  CardStatus,
  ConversationReducerState,
  RevertState,
  RunIdPayload,
  RunToolCall,
} from "./conversation-types";
import { isReasoningActivity } from "./conversation-types";
import {
  activityTiming,
  ensureActivity,
  finishRunningReasoning,
  stampActivityElapsed,
} from "./conversation-run-helpers";
import { cancelRun, completeRun, interruptRun, restartRun, runFailed, setUsage } from "./conversation-run-lifecycle";
import {
  appendAssistantReasoning,
  rollbackSubmitTurn,
  submitTurn,
  updateAssistantText,
} from "./conversation-run-stream";

export * from "./conversation-types";

export { dropRuns, findLatestErroredRun, getVisibleMessages, hasRetryableTurn } from "./conversation-run-helpers";

const actions = {
  updateAssistantText,
  appendAssistantReasoning,
  submitTurn,
  rollbackSubmitTurn,
  addCard,
  setCardStatus,
  addToolCall,
  setToolCallResult,
  completeRun,
  runFailed,
  cancelRun,
  interruptRun,
  restartRun,
  setUsage,
  setAIProfile,
  setAIModel,
  setAIModelParameter,
  dismissRunError,
  markRead,
  newConversation,
  setPromptInput,
  setRevertState,
  commitRevert,
};

export type ConversationReducerAction = ReducerAction<typeof actions, ConversationReducerState>;

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

type AddToolCallPayload = { runId: string; call: Pick<RunToolCall, "id" | "name" | "input"> };

// WHY: duplicate ids are skipped idempotently — a provider replaying a tool
// call must not double-record it on the run.
function addToolCall(draft: ConversationReducerState, payload: AddToolCallPayload) {
  const run = draft.runs[payload.runId];
  if (!run) return;
  const activity = ensureActivity(run);
  if (activity.some((call) => call.id === payload.call.id)) return;
  // WHY: a tool call is the next timeline step — close thinking so the
  // widget can collapse it before the new tool row appears.
  finishRunningReasoning(run);
  activity.push({
    ...payload.call,
    input: boundToolOutput(payload.call.input),
    status: "running",
    ...activityTiming(),
  });
}

type SetToolCallResultPayload = { runId: string; callId: string; output?: unknown; error?: unknown };

// WHY: an unmatched callId is a no-op — a result racing a restart-cleared run
// must not resurrect tool traffic.
function setToolCallResult(draft: ConversationReducerState, payload: SetToolCallResultPayload) {
  const run = draft.runs[payload.runId];
  if (!run) return;
  const call = run.toolCalls?.find(
    (entry): entry is RunToolCall => !isReasoningActivity(entry) && entry.id === payload.callId,
  );
  if (!call) return;
  stampActivityElapsed(call);
  if (payload.error !== undefined) {
    call.status = "error";
    call.error = boundToolError(payload.error);
    return;
  }
  call.status = "success";
  // WHY: card extraction parses the FULL output before the run record's copy
  // is bounded — truncation must never starve propose_cards.
  applyProposeCardsToRun(draft, payload.runId, call, payload.output);
  call.output = boundToolOutput(payload.output);
}

// WHY: tool inputs and outputs ride the conversation document, rewritten in
// full on every autosave. The live tool flow needs the full payload, the run
// record does not — cap what we persist so a tool-heavy conversation cannot
// grow the blob unboundedly.
const MAX_TOOL_OUTPUT_CHARS = 2000;
const MAX_TOOL_OUTPUT_PREVIEW_CHARS = 400;

export function boundToolOutput(output: unknown): unknown {
  if (output === null || typeof output !== "object") return output;
  const serialized = JSON.stringify(output);
  if (serialized === undefined || serialized.length <= MAX_TOOL_OUTPUT_CHARS) return output;
  const record = output as Record<string, unknown>;
  const totalCards = record.totalCards;
  const rejectedCount = record.rejectedCount;
  const cards = record.cards;
  return {
    isTruncated: true,
    itemCount: Array.isArray(output) ? output.length : Object.keys(output).length,
    // WHY: the tool-row headline counts cards via totalCards (spec Visibility);
    // without this, any get_deck_cards output past the cap renders name-only.
    ...(typeof totalCards === "number" && Number.isFinite(totalCards) ? { totalCards } : {}),
    // WHY: propose_cards headline counts accepted cards and skipped drops;
    // truncation must not hide those counts (ASSISTANT-DATA-ACCESS.md Visibility).
    ...(Array.isArray(cards) ? { acceptedCount: cards.length } : {}),
    ...(typeof rejectedCount === "number" && Number.isInteger(rejectedCount) ? { rejectedCount } : {}),
    preview: serialized.slice(0, MAX_TOOL_OUTPUT_PREVIEW_CHARS),
  };
}

const MAX_TOOL_ERROR_CHARS = 2000;

// WHY: tool errors arrive as arbitrary stream values — a raw AI SDK error part
// on the browser path, a pre-flattened string over Electron IPC. Store a
// bounded string so a tool failure cannot grow the persisted blob with an
// unbounded error object.
export function boundToolError(error: unknown): string {
  let text: string;
  if (typeof error === "string") {
    text = error;
  } else if (error instanceof Error) {
    text = error.message || String(error);
  } else if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) {
      text = message;
    } else {
      try {
        text = JSON.stringify(error) ?? String(error);
      } catch {
        text = String(error);
      }
    }
  } else {
    text = String(error);
  }
  return text.length <= MAX_TOOL_ERROR_CHARS ? text : `${text.slice(0, MAX_TOOL_ERROR_CHARS)}…`;
}

// WHY: runtime must not parse tool payloads; the call name already lives on the run.
function applyProposeCardsToRun(draft: ConversationReducerState, runId: string, call: RunToolCall, output: unknown) {
  if (call.name !== "propose_cards") return;
  if (!isProposeCardsOutput(output)) return;
  // INVARIANT: empty accept must not set writeTargetDeckId, writeTargetTemplateId, or templateFields.
  if (output.cards.length === 0) return;

  const run = draft.runs[runId];
  if (!run) return;

  // WHY: first write target wins — a later propose_cards for a different deck
  // must not retarget the run or mix in those cards; the tool row is still stored.
  if (run.writeTargetDeckId !== undefined && run.writeTargetDeckId !== output.deckId) return;

  if (run.writeTargetDeckId === undefined) {
    run.writeTargetDeckId = output.deckId;
    run.writeTargetTemplateId = output.templateId;
    run.templateFields = output.templateFields.map((field) => ({
      id: field.id,
      title: field.title,
      type: field.type,
      isRequired: field.isRequired,
    }));
  }

  for (const card of generatedCardsFromProposeOutput(output)) {
    addCard(draft, { runId, card });
  }
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
  // INVARIANT: Create stamps updatedAt once, equal to createdAt. Later prompt
  // and title edits must not bump it; the next bump is a submitted run.
  draft.updatedAt = payload.createdAt;
  draft.messages = [];
  draft.runs = {};
  draft.activeRunId = null;
  draft.dismissedRunErrorId = null;
  draft.profileId = payload.profileId ?? null;
  draft.modelId = payload.modelId ?? null;
  draft.modelParameters = payload.modelParameters ?? {};
  draft.lastReadRunId = null;
  draft.promptInput = "";
  draft.revertState = null;
}

function setPromptInput(draft: ConversationReducerState, payload: string) {
  if (draft.promptInput === payload) return;
  draft.promptInput = payload;
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
    const runId = getMessageRunId(m);
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
