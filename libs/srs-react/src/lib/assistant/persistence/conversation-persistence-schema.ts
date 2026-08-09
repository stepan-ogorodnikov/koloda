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
 * WHY (ASSISTANT-CHAT-REFACTOR.md §C): persisted rows are a *compatibility
 * boundary*. The hand-rolled coercion in `conversation-persistence.ts`
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
 * pre-refactor `elapsedSeconds`/`deckId` gates, which rejected `undefined`. */
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
 * rejects arrays, so any cards-mode run that persisted its non-null
 * `templateFields` failed the whole row on restore and the conversation fell
 * back to a fresh empty state (empty feed after reload). Tighter than the old
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

const runSchema: z.ZodType<GenerationRun> = z
  .object({
    id: z.string(),
    mode: z.enum(["chat", "cards"]),
    // INVARIANT: status must be one of the five known values — never an
    // arbitrary string cast to RunStatus.
    status: runStatusField,
    reason: terminationReasonField,
    cards: z.array(z.unknown()),
    cardStatuses: z.record(z.string(), z.unknown()),
    templateFields: templateFieldsField,
    startedAt: dateField,
    elapsedSeconds: nullableNumberField,
    modelName: modelNameField,
    usage: passthroughField,
    error: errorField,
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
      mode: run.mode,
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
    deckId: nullableNumberField,
    mode: z.enum(["chat", "cards"]),
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
      deckId: state.deckId,
      mode: state.mode,
    }),
  );

/**
 * Coerce a persisted row into a `ConversationReducerState`, or `null` when the
 * row is absent, declares an unknown future schemaVersion, or fails the
 * compatibility schema. Migrations run at this boundary before validation.
 */
export function coerceConversationState(value: unknown): ConversationReducerState | null {
  const migrated = migratePersistedConversation(value);
  if (!migrated) return null;
  const result = persistedConversationStateSchema.safeParse(migrated);
  return result.success ? fromPersistedState(result.data) : null;
}
