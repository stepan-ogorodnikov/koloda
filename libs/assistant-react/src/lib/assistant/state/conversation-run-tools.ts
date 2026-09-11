import { generatedCardsFromProposeOutput, isProposeCardsOutput } from "@koloda/ai";
import type { GeneratedCard } from "@koloda/ai";
import type { CardStatus, ConversationReducerState, RunToolCall } from "./conversation-types";
import { isReasoningActivity } from "./conversation-types";
import {
  activityTiming,
  ensureActivity,
  finishRunningReasoning,
  stampActivityElapsed,
} from "./conversation-run-helpers";

type AddCardPayload = { runId: string; card: GeneratedCard };

export function addCard(draft: ConversationReducerState, payload: AddCardPayload) {
  const run = draft.runs[payload.runId];
  if (!run) return;
  run.cards.push(payload.card);
  run.cardStatuses[run.cards.length - 1] = "idle";
}

type SetCardStatusPayload = { runId: string; index: number; status: CardStatus };

export function setCardStatus(draft: ConversationReducerState, payload: SetCardStatusPayload) {
  const run = draft.runs[payload.runId];
  if (run) run.cardStatuses[payload.index] = payload.status;
}

type AddToolCallPayload = { runId: string; call: Pick<RunToolCall, "id" | "name" | "input"> };

// WHY: duplicate ids are skipped idempotently — a provider replaying a tool
// call must not double-record it on the run.
export function addToolCall(draft: ConversationReducerState, payload: AddToolCallPayload) {
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
export function setToolCallResult(draft: ConversationReducerState, payload: SetToolCallResultPayload) {
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
