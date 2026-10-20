import type { GeneratedCard, StreamUsage } from "@koloda/ai";
import type { TemplateFields } from "@koloda/srs";
import type { UIMessage } from "ai";
import type { PersistedConversation } from "./conversation-persistence";
import { fromPersistedState } from "./conversation-persistence";
import { CONVERSATION_SCHEMA_VERSION } from "./conversation-schema-version";
import type {
  CardStatus,
  ConversationReducerState,
  AssistantRun,
  RunActivity,
  RunStatus,
  RunTerminationReason,
} from "../state/conversation-types";
import { z } from "zod";

/**
 * Restore schemas for stored conversation rows.
 *
 * INVARIANT: They accept the shape the current build writes
 * (`toPersistedState`, then JSON) and nothing older: no defaults for missing
 * fields and no repairs. One bad field fails the whole row as corrupt.
 * Unknown keys, including a stale `revertState`, are stripped; live state is
 * rebuilt via `fromPersistedState`.
 */

// INVARIANT: structural card check, so a malformed card fails the row as
// corrupt instead of reaching the renderer and crashing it. Extra fields are
// tolerated.
const cardShape = z.object({
  content: z.record(z.string(), z.object({ text: z.string() })),
});

// INVARIANT: structural message check, so a row with `parts: null` fails as
// corrupt instead of reaching the renderer and crashing it. Extra fields are
// tolerated.
const messageShape = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.unknown()),
  metadata: z.unknown().optional(),
});

// WHY: Timestamps sit in the stored JSON as ISO strings on both hosts.
function toDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Required date field: an ISO string → Date; anything else fails. */
const dateField = z.preprocess(toDate, z.date());

/** `null` → `null`; an ISO string → Date; anything else, including a missing value, fails. */
const nullableDateField = z.unknown().transform((v, ctx): Date | null => {
  if (v === null) return null;
  const d = toDate(v);
  if (!d) {
    ctx.addIssue({ code: "custom", message: "expected an ISO date string or null" });
    return z.NEVER;
  }
  return d;
});

/** `null` → `null`; a finite number → number; anything else, including a missing value, fails. */
const nullableNumberField = z.unknown().transform((v, ctx): number | null => {
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  ctx.addIssue({ code: "custom", message: "expected a number or null" });
  return z.NEVER;
});

/** `templateFields`: `null` or a `TemplateFields` array; anything else fails.
 * WHY: `TemplateFields` is `Template["content"]["fields"]` — an *array* of field
 * objects, not a record. Validating it as a record would fail every proposal
 * run on restore. */
const templateFieldsField = z.union([z.null(), z.array(z.unknown())]);

/** Tolerate an untyped passthrough value (e.g. `usage`). */
const passthroughField = z.unknown();

/** Live run errors are bounded by the runtime when they are recorded. */
const errorField = z.object({ message: z.string(), details: z.string().optional() }).optional();

/** `reason`: absent → omit; a known reason → passthrough; anything else fails. */
const terminationReasonField = z.enum(["user", "app_shutdown", "crash_recovery"]).optional();

const runStatusField = z.enum(["streaming", "success", "failed", "canceled", "interrupted"]);

const cardStatusField = z.enum(["idle", "pending", "success", "error"]);

/**
 * `dataAccess` snapshot: the submit-time context text plus its manifest. The
 * shape mirrors `DataAccessManifest` (`../runs/data-access.ts`) — the single
 * source of truth; do not invent a parallel persistence-only shape. Unknown
 * extra keys are stripped like the rest of the row, but known-shape violations
 * (a string where a UUID belongs, a missing required field, a write target
 * whose `isMissing` flag does not match its record) fail the whole row.
 */
const deckSummaryField = z.object({
  deckId: z.uuid(),
  title: z.string(),
  cardCount: z.number(),
  templateTitle: z.string().nullable(),
});

// INVARIANT: `isMissing` is the discriminator — a present write target is
// either the missing-deck marker or the full record, never a mix of both.
const writeTargetField = z.discriminatedUnion("isMissing", [
  z.object({ isMissing: z.literal(true) }),
  z.object({
    isMissing: z.literal(false),
    deckId: z.uuid(),
    title: z.string(),
    totalCards: z.number(),
    listedCards: z.number(),
    fullFieldCards: z.number(),
    isCapped: z.boolean(),
    isTruncated: z.boolean(),
  }),
]);

const dataAccessManifestField = z.object({
  decks: z.array(deckSummaryField),
  /** Null on chat runs — chat never includes card contents. */
  writeTarget: writeTargetField.nullable(),
});

const dataAccessSnapshotField = z.object({
  context: z.string(),
  manifest: dataAccessManifestField,
});

const toolCallStatusField = z.enum(["running", "success", "error"]);

/**
 * Tool activity recorded on the run. Shape mirrors `RunToolCall`; unknown
 * extra keys are stripped. Live code bounds `input` and `error` when it
 * records a call, so restore does not re-bound them.
 */
const toolCallField = z.object({
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
  status: toolCallStatusField,
  output: z.unknown().optional(),
  error: z.string().optional(),
  startedAt: dateField,
  elapsedSeconds: z.number().nullable(),
});

const reasoningActivityField = z.object({
  kind: z.literal("reasoning"),
  id: z.string(),
  text: z.string(),
  status: z.enum(["running", "done"]),
  startedAt: dateField,
  elapsedSeconds: z.number().nullable(),
});

// WHY: Live tool calls carry no `kind`; only reasoning rows do.
const activityField = z.union([reasoningActivityField, toolCallField]);

const runSchema: z.ZodType<AssistantRun> = z
  .object({
    id: z.string(),
    // INVARIANT: status must be one of the five known values — never an
    // arbitrary string cast to RunStatus.
    status: runStatusField,
    reason: terminationReasonField,
    cards: z.array(cardShape),
    // INVARIANT: each card status must be one of the four known values — never an
    // arbitrary string cast to CardStatus.
    cardStatuses: z.record(z.string(), cardStatusField),
    templateFields: templateFieldsField,
    startedAt: dateField,
    elapsedSeconds: nullableNumberField,
    modelName: z.string().optional(),
    usage: passthroughField,
    error: errorField,
    // INVARIANT: optional so rows saved before data access restore unchanged;
    // when present it must validate — a malformed manifest fails the row as
    // corrupt rather than silently dropping the snapshot from the run.
    dataAccess: dataAccessSnapshotField.optional(),
    // INVARIANT: a malformed array fails the row as corrupt rather than
    // silently dropping tool history from the run.
    toolCalls: z.array(activityField),
    // INVARIANT: optional because a live run sets them only once
    // `propose_cards` succeeds; a present value must be a UUID — a malformed
    // value fails the row as corrupt rather than silently dropping the target.
    writeTargetDeckId: z.uuid().optional(),
    writeTargetTemplateId: z.uuid().optional(),
  })
  .superRefine((run, ctx) => {
    // INVARIANT: canceled → reason:user; interrupted → app_shutdown|crash_recovery;
    // success/failed/streaming must not carry a termination reason.
    if (run.status === "canceled") {
      if (run.reason !== "user") {
        ctx.addIssue({
          code: "custom",
          path: ["reason"],
          message: 'canceled runs require reason "user"',
        });
      }
      return;
    }
    if (run.status === "interrupted") {
      if (run.reason !== "app_shutdown" && run.reason !== "crash_recovery") {
        ctx.addIssue({
          code: "custom",
          path: ["reason"],
          message: 'interrupted runs require reason "app_shutdown" or "crash_recovery"',
        });
      }
      return;
    }
    if (run.reason !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: `${run.status} runs must not carry a termination reason`,
      });
    }
  })
  .transform((run): AssistantRun => {
    const status = run.status as RunStatus;
    const reason =
      status === "canceled" || status === "interrupted" ? (run.reason as RunTerminationReason | undefined) : undefined;
    return {
      id: run.id,
      status,
      reason,
      cards: run.cards as GeneratedCard[],
      cardStatuses: run.cardStatuses as Record<number, CardStatus>,
      templateFields: (run.templateFields ?? null) as TemplateFields | null,
      startedAt: run.startedAt,
      elapsedSeconds: run.elapsedSeconds,
      modelName: run.modelName,
      usage: run.usage as StreamUsage | undefined,
      error: run.error,
      dataAccess: run.dataAccess,
      toolCalls: run.toolCalls as RunActivity[],
      writeTargetDeckId: run.writeTargetDeckId,
      writeTargetTemplateId: run.writeTargetTemplateId,
    };
  });

/** The stored conversation row schema. Shape is `PersistedConversation` (`revertState` absent). */
const persistedConversationStateSchema: z.ZodType<PersistedConversation> = z
  .object({
    schemaVersion: z.literal(CONVERSATION_SCHEMA_VERSION),
    id: z.string(),
    createdAt: dateField,
    updatedAt: nullableDateField,
    messages: z.array(messageShape),
    runs: z.record(z.string(), runSchema),
    activeRunId: z.string().nullable(),
    dismissedRunErrorId: z.string().nullable(),
    profileId: z.string().nullable(),
    modelId: z.string().nullable(),
    modelParameters: z.record(z.string(), z.string()),
    lastReadRunId: z.string().nullable(),
    promptInput: z.string(),
  })
  .transform(
    (state): PersistedConversation => ({
      schemaVersion: state.schemaVersion,
      id: state.id,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      messages: state.messages as UIMessage[],
      runs: state.runs,
      activeRunId: state.activeRunId,
      dismissedRunErrorId: state.dismissedRunErrorId,
      profileId: state.profileId,
      modelId: state.modelId,
      modelParameters: state.modelParameters,
      lastReadRunId: state.lastReadRunId,
      promptInput: state.promptInput,
    }),
  );

/**
 * A single validation failure on a corrupt persisted row. Carries enough
 * structure (zod issue code + path + message) for recovery UX to show a
 * short diagnostic list without exposing raw zod objects.
 */
export type RestoreIssue = {
  /** Dot-joined zod issue path; `"(root)"` when the whole row failed. */
  path: string;
  /** Zod issue code (e.g. `"invalid_type"`, `"custom"`). */
  kind: string;
  message: string;
};

/**
 * Discriminated outcome of restoring a persisted conversation row.
 *
 * WHY: `null` collapsed "no row", "future version",
 * and "corrupt" into one rejection, so restore treated unsupported
 * data as missing and could autosave an empty current-version row over it.
 * The statuses are deliberately separate user stories:
 * - `missing`: no row existed — safe to create fresh state and save normally.
 * - `unsupportedVersion`: the row declares a version this build cannot load —
 *   upgrade/export/delete recovery, never an automatic overwrite.
 * - `corrupt`: a row exists at a supported (or undeterminable) version but
 *   fails parsing — explicit reset/export/delete recovery.
 * - `ok`: normalized, validated live state.
 */
export type ConversationRestoreResult =
  | { status: "ok"; state: ConversationReducerState }
  | { status: "missing" }
  | { status: "unsupportedVersion"; found: number; supported: number }
  | { status: "corrupt"; issues: RestoreIssue[] };

function toRestoreIssues(issues: z.core.$ZodIssue[]): RestoreIssue[] {
  return issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    kind: issue.code,
    message: issue.message,
  }));
}

export function coerceConversationState(value: unknown): ConversationRestoreResult {
  // WHY: an absent row reaches this boundary as `undefined` (the restore
  // query resolves `null` and the hook unwraps `conversationData?.state`).
  // Any other non-object is a row that exists but cannot be parsed.
  if (value === undefined) return { status: "missing" };

  // INVARIANT: A row from a newer build never loads into live state. Any
  // other missing or mismatched version fails the schema's version literal
  // as corrupt; older rows are not migrated.
  const declared =
    value !== null && typeof value === "object" ? (value as Record<string, unknown>).schemaVersion : undefined;
  if (typeof declared === "number" && Number.isInteger(declared) && declared > CONVERSATION_SCHEMA_VERSION) {
    return { status: "unsupportedVersion", found: declared, supported: CONVERSATION_SCHEMA_VERSION };
  }

  const result = persistedConversationStateSchema.safeParse(value);
  if (!result.success) {
    return { status: "corrupt", issues: toRestoreIssues(result.error.issues) };
  }
  return { status: "ok", state: fromPersistedState(result.data) };
}
