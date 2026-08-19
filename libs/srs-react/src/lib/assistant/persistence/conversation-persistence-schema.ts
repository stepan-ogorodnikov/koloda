import type { GeneratedCard, ModelParameter, StreamUsage } from "@koloda/ai";
import type { TemplateFields } from "@koloda/srs";
import type { UIMessage } from "ai";
import type { PersistedConversation } from "./conversation-persistence";
import { fromPersistedState } from "./conversation-persistence";
import { CONVERSATION_SCHEMA_VERSION, migratePersistedConversation } from "./conversation-schema-version";
import type {
  CardStatus,
  ConversationReducerState,
  GenerationRun,
  RunStatus,
  RunTerminationReason,
} from "../state/conversation-reducer";
import { z } from "zod";

/**
 * Persistence/coercion schemas for restored conversation rows.
 *
 * WHY: persisted rows are a *compatibility boundary*.
 * The hand-rolled coercion in `conversation-persistence.ts`
 * deliberately does three things a naive Zod port would lose:
 *   1. `toDate` — coerce ISO-string / epoch-number / Date timestamps into
 *      `Date`, failing the *whole row* on an unparseable required date.
 *   2. Default missing legacy optional fields (`profileId`/`modelId`/…
 *      → `null`; `modelParameters` → `{}`) while still rejecting wrong-typed
 *      present values.
 *   3. Parse into `PersistedConversation` (no `revertState`; unknown keys
 *      including a stale `revertState` are stripped). Live state is rebuilt
 *      via `fromPersistedState`. Also tolerate untyped `messages`/`cards`/
 *      `usage`. Legacy `request` on runs is stripped (never read back; retry
 *      rebuilds live).
 *
 * The existing `conversation-restore.test.ts` fixtures are the contract; this
 * port keeps them green for all real persisted rows. The collapse on the first
 * bad field/run (`safeParse` → `null`) is preserved. The only intentional
 * tightening vs. the old truthy gate is `templateFields`: it now accepts only
 * `null` or a `TemplateFields` array and rejects records, whereas the old gate
 * alone would have accepted and miscast a record — records are never
 * persisted, so no real row changes behavior.
 */

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  return null;
}

/** Required date field: string/number/Date → Date; anything else fails. */
const dateField = z.preprocess(toDate, z.date());

/** `null`-able date: `null` → `null`; otherwise a valid date. Mirrors the
 * pre-refactor `updatedAt` rule (missing/unparseable → fail, not coerce). */
const nullableDateField = z.unknown().transform((v, ctx): Date | null => {
  if (v === null) return null;
  const d = toDate(v);
  if (!d) {
    ctx.addIssue({ code: "custom", message: "expected a Date, ISO string, epoch, or null" });
    return z.NEVER;
  }
  return d;
});

/** `string | null | undefined` → `string | null`; non-strings fail. */
const optionalString = z
  .string()
  .nullish()
  .transform((v) => v ?? null);

/** `null`-able number: `null` → `null`; a finite number → number; else fail.
 * A *missing* value fails the row, unlike `optionalString` — mirrors the
 * pre-refactor `elapsedSeconds` gate, which rejected `undefined`. */
const nullableNumberField = z.unknown().transform((v, ctx): number | null => {
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  ctx.addIssue({ code: "custom", message: "expected a number or null" });
  return z.NEVER;
});

/**
 * `modelParameters`: `null`/`undefined`/`object` → a map of string→string with
 * null-valued entries dropped. A non-object (other than null/undefined) or a
 * non-string, non-null entry value fails the whole row.
 */
const modelParametersField = z
  .record(z.string(), z.string().nullable())
  .nullish()
  .transform((entries) => {
    const out: Partial<Record<ModelParameter["type"], string>> = {};
    for (const [key, val] of Object.entries(entries ?? {})) {
      if (val === null) continue;
      out[key as ModelParameter["type"]] = val;
    }
    return out;
  });

/** `modelName`: `null`/`undefined` → `undefined`; `string` → `string`; else fail. */
const modelNameField = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined);

/** `templateFields`: `null` → `null`; a `TemplateFields` array → passthrough; else fail.
 * WHY: `TemplateFields` is `Template["content"]["fields"]` — an *array* of field
 * objects, not a record. A previous port used `z.record(...)` here, which
 * rejects arrays, so any run that persisted its non-null `templateFields`
 * failed the whole row on restore and the conversation fell back to a fresh
 * empty state (empty feed after reload). Tighter than the old
 * truthy gate, which would have accepted and miscast a record; no real row is
 * a record, so behavior for persisted rows is unchanged (see file header). */
const templateFieldsField = z.union([z.null(), z.array(z.unknown())]);

/** Tolerate an untyped passthrough value (e.g. `usage`). */
const passthroughField = z.unknown();

/** `error`: a falsy/absent value → `undefined`; a truthy object → `{ message }`. */
const errorField = z
  .unknown()
  .transform((error): { message: string } | undefined =>
    error && typeof error === "object"
      ? { message: String((error as Record<string, unknown>).message ?? "") }
      : undefined,
  );

/** `reason`: absent/null/undefined → omit; known string → passthrough; else fail. */
const terminationReasonField = z
  .enum(["user", "app_shutdown", "crash_recovery"])
  .nullish()
  .transform((v) => v ?? undefined);

const runStatusField = z.enum(["streaming", "success", "failed", "canceled", "interrupted"]);

const cardStatusField = z.enum(["idle", "pending", "success", "error"]);

/**
 * `dataAccess` snapshot: the submit-time context text plus its manifest. The
 * shape mirrors `DataAccessManifest` (`../runs/data-access.ts`) — the single
 * source of truth; do not invent a parallel persistence-only shape. Unknown
 * extra keys are stripped like the rest of the row, but known-shape violations
 * (a string where a number belongs, a missing required field, a write target
 * whose `isMissing` flag does not match its record) fail the whole row.
 */
const deckSummaryField = z.object({
  deckId: z.number(),
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
    deckId: z.number(),
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
 * Tool activity recorded on the run. Shape mirrors `RunToolCall` — unknown
 * extra keys are stripped; a present-but-invalid array fails the whole row
 * as corrupt (same optional-field policy as `dataAccess`).
 */
const toolCallField = z.object({
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
  status: toolCallStatusField,
  output: z.unknown().optional(),
  error: z.unknown().optional(),
});

const runSchema: z.ZodType<GenerationRun> = z
  .object({
    id: z.string(),
    // WHY: Live runs have no mode. Historical `"chat"` is stripped;
    // `"cards"` (and any other value) fails the row as corrupt — not rewritten
    // into chat.
    mode: z.enum(["chat"]).optional(),
    // INVARIANT: status must be one of the five known values — never an
    // arbitrary string cast to RunStatus.
    status: runStatusField,
    reason: terminationReasonField,
    cards: z.array(z.unknown()),
    // INVARIANT: each card status must be one of the four known values — never an
    // arbitrary string cast to CardStatus.
    cardStatuses: z.record(z.string(), cardStatusField),
    templateFields: templateFieldsField,
    startedAt: dateField,
    elapsedSeconds: nullableNumberField,
    modelName: modelNameField,
    usage: passthroughField,
    error: errorField,
    // INVARIANT: optional so rows saved before data access restore unchanged;
    // when present it must validate — a malformed manifest fails the row as
    // corrupt rather than silently dropping the snapshot from the run.
    dataAccess: dataAccessSnapshotField.optional(),
    // INVARIANT: optional so rows saved before tool activity restore unchanged;
    // when present it must validate — a malformed array fails the row as
    // corrupt rather than silently dropping tool history from the run.
    toolCalls: z.array(toolCallField).optional(),
    // INVARIANT: optional so rows saved before proposed-card write targets
    // restore unchanged; when present it must be a positive int — a malformed
    // value fails the row as corrupt rather than silently dropping the target.
    writeTargetDeckId: z.number().int().positive().optional(),
    writeTargetTemplateId: z.number().int().positive().optional(),
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
  .transform((run): GenerationRun => {
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
      toolCalls: run.toolCalls,
      writeTargetDeckId: run.writeTargetDeckId,
      writeTargetTemplateId: run.writeTargetTemplateId,
    };
  });

/**
 * The persisted conversation row schema. Shape is `PersistedConversation`
 * (`revertState` absent). `dismissedRunErrorId` is tolerated as any type
 * (matching the pre-refactor "no validation gate" behavior) and defaulted
 * to `null`.
 */
const persistedConversationStateSchema: z.ZodType<PersistedConversation> = z
  .object({
    schemaVersion: z.literal(CONVERSATION_SCHEMA_VERSION),
    id: z.string(),
    createdAt: dateField,
    updatedAt: nullableDateField,
    messages: z.array(z.unknown()),
    runs: z.record(z.string(), runSchema),
    activeRunId: optionalString,
    dismissedRunErrorId: z.unknown().transform((v) => (v ?? null) as string | null),
    profileId: optionalString,
    modelId: optionalString,
    modelParameters: modelParametersField,
    lastReadRunId: optionalString,
    // WHY: Live conversations have no mode. Historical `"chat"` is stripped;
    // `"cards"` (and any other value) fails the row as corrupt — not rewritten
    // into chat.
    mode: z.enum(["chat"]).optional(),
  })
  .superRefine((state, ctx) => {
    for (let i = 0; i < state.messages.length; i++) {
      const message = state.messages[i];
      if (!message || typeof message !== "object" || Array.isArray(message)) continue;
      const metadata = (message as Record<string, unknown>).metadata;
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) continue;
      const kind = (metadata as Record<string, unknown>).kind;
      const mode = (metadata as Record<string, unknown>).mode;
      // INVARIANT: Do not restore generated-cards or cards-mode error markers.
      // Those documents are corrupt, not rewritten into chat-text.
      if (kind === "generated-cards") {
        ctx.addIssue({
          code: "custom",
          path: ["messages", i, "metadata", "kind"],
          message: '"generated-cards" is not a valid message kind',
        });
      }
      if (mode === "cards") {
        ctx.addIssue({
          code: "custom",
          path: ["messages", i, "metadata", "mode"],
          message: '"cards" is not a valid assistant mode',
        });
      }
    }
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
  /** Human-readable description of the failure. */
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

/**
 * Coerce a persisted row into a `ConversationRestoreResult`. Migrations run
 * at this boundary before validation; the versioned-schema policy lives in
 * `migratePersistedConversation` and is only re-read here for the
 * `unsupportedVersion` `supported` number.
 */
export function coerceConversationState(value: unknown): ConversationRestoreResult {
  // WHY: an absent row reaches this boundary as `undefined` (the restore
  // query resolves `null` and the hook unwraps `conversationData?.state`).
  // Any other non-object is a row that exists but cannot be parsed.
  if (value === undefined) return { status: "missing" };

  const migrated = migratePersistedConversation(value);
  if (migrated.status === "unsupportedVersion") {
    return {
      status: "unsupportedVersion",
      found: migrated.found,
      supported: CONVERSATION_SCHEMA_VERSION,
    };
  }
  if (migrated.status === "invalid") {
    return {
      status: "corrupt",
      issues:
        migrated.reason === "not-an-object"
          ? [{ path: "(root)", kind: "invalid_type", message: "expected a conversation object" }]
          : [{ path: "schemaVersion", kind: "invalid_type", message: "expected a non-negative integer schemaVersion" }],
    };
  }

  const result = persistedConversationStateSchema.safeParse(migrated.value);
  if (!result.success) {
    return { status: "corrupt", issues: toRestoreIssues(result.error.issues) };
  }
  return { status: "ok", state: fromPersistedState(result.data) };
}
