import type { GeneratedCard, ModelParameter, StreamUsage } from "@koloda/ai";
import type { AssistantRunError } from "@koloda/assistant";
import type { TemplateFields } from "@koloda/srs";
import type { DataAccessSnapshot } from "../runs/data-access";
import type { UIMessage } from "ai";

export type CardStatus = "idle" | "pending" | "success" | "error";

export type RunStatus = "streaming" | "success" | "failed" | "canceled" | "interrupted";

/** Why a run ended as `canceled` (user request) or `interrupted` (non-user stop). */
export type RunTerminationReason = "user" | "app_shutdown" | "crash_recovery";

export type InterruptedReason = Exclude<RunTerminationReason, "user">;

export type ToolCallStatus = "running" | "success" | "error";

/**
 * Tool activity recorded on the run — mirrors `cards`/`cardStatuses` on the
 * run record: message parts and follow-up history never replay tool traffic.
 */
export type RunToolCall = {
  id: string;
  name: string;
  input: unknown;
  status: ToolCallStatus;
  output?: unknown;
  // WHY: always a bounded string (`boundToolError`) so a tool failure cannot
  // grow the persisted blob with an arbitrary error object.
  error?: string;
  // WHY: optional so rows saved before activity timers restore without them;
  // live calls always stamp both (`activityTiming` / `stampActivityElapsed`).
  startedAt?: Date;
  elapsedSeconds?: number | null;
};

/**
 * Chain-of-thought recorded on the same activity list as tools so think →
 * tool → think stays in arrival order. Not a protocol tool call.
 */
export type RunReasoningActivity = {
  kind: "reasoning";
  id: string;
  text: string;
  status: "running" | "done";
  // WHY: optional so rows saved before activity timers restore without them;
  // live thinking always stamps both (`activityTiming` / `stampActivityElapsed`).
  startedAt?: Date;
  elapsedSeconds?: number | null;
};

export type RunActivity = RunToolCall | RunReasoningActivity;

export function isReasoningActivity(entry: RunActivity): entry is RunReasoningActivity {
  return "kind" in entry && entry.kind === "reasoning";
}

export type AssistantRun = {
  id: string;
  status: RunStatus;
  /** Set for terminal `canceled` / `interrupted` only; absent otherwise. */
  reason?: RunTerminationReason;
  cards: GeneratedCard[];
  cardStatuses: Record<number, CardStatus>;
  // WHY: optional so rows saved before tool activity restore unchanged; live
  // runs always initialize the field (`makeRun`). When present, persistence
  // validates the array — a malformed payload fails the row as corrupt.
  // Reasoning rows (`kind: "reasoning"`) share this list so the activity
  // widget can interleave thinking with real tool calls.
  toolCalls?: RunActivity[];
  templateFields: TemplateFields | null;
  // WHY: optional so rows saved before proposed-card write targets restore
  // unchanged; live chat runs set it when `propose_cards` first succeeds.
  // When present, persistence requires a UUID string — malformed fails the row.
  writeTargetDeckId?: string;
  writeTargetTemplateId?: string;
  error?: AssistantRunError;
  startedAt: Date;
  elapsedSeconds: number | null;
  modelName?: string;
  usage?: StreamUsage;
  /** Optional restore field from v1 injection. New submits omit it; malformed values fail as corrupt. */
  dataAccess?: DataAccessSnapshot;
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
  runs: Record<string, AssistantRun>;
  activeRunId: string | null;
  dismissedRunErrorId: string | null;
  profileId: string | null;
  modelId: string | null;
  modelParameters: Partial<Record<ModelParameter["type"], string>>;
  // INVARIANT: A conversation is unread when its latest non-streaming
  // run's id differs from this pointer. The pointer is cleared when the
  // referenced run is dropped so the unread predicate stays correct.
  lastReadRunId: string | null;
  // WHY: The composer belongs to the conversation, not the chat shell.
  // Switching conversations must restore this text. Updating it must not
  // stamp `updatedAt` — it is not a turn.
  promptInput: string;
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
  profileId: null,
  modelId: null,
  modelParameters: {},
  lastReadRunId: null,
  promptInput: "",
  revertState: null,
};

export type RunLifecycleEvent =
  | { type: "complete" }
  | { type: "fail"; error: AssistantRunError }
  | { type: "cancel" }
  | { type: "interrupt"; reason: InterruptedReason }
  | {
      type: "restart";
      templateFields: TemplateFields | null;
      modelName?: string;
    };

export type RunIdPayload = { runId: string };
