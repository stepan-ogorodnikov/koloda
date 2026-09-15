/**
 * Persistence schema version for conversation rows.
 *
 * WHY: New lifecycle statuses/reasons made the persisted shape versioned.
 * Unknown future versions must fail at the coerce boundary rather than
 * silently entering live state.
 */
export const CONVERSATION_SCHEMA_VERSION = 1;

export type PersistedSchemaVersion = typeof CONVERSATION_SCHEMA_VERSION;

/**
 * Outcome of migrating a raw persisted row to {@link CONVERSATION_SCHEMA_VERSION}.
 *
 * WHY: the restore boundary must tell "no row", "future version", and "corrupt
 * row" apart instead of collapsing them into one rejection, so it can refuse
 * to autosave over unsupported data.
 */
export type PersistedMigrationResult =
  | { status: "ok"; value: Record<string, unknown> }
  | { status: "unsupportedVersion"; found: number }
  | { status: "invalid"; reason: "not-an-object" | "malformed-version" };

/**
 * Migrate a raw persisted row to {@link CONVERSATION_SCHEMA_VERSION}.
 *
 * - `ok`: the row migrated (or is already current) and is ready for schema
 *   validation.
 * - `unsupportedVersion`: the row declares a version this build cannot load —
 *   newer than {@link CONVERSATION_SCHEMA_VERSION}, or one with no migration
 *   path. `found` carries the declared version.
 * - `invalid`: the row is not an object or its `schemaVersion` is not a
 *   non-negative integer, so the version cannot be determined.
 */
export function migratePersistedConversation(value: unknown): PersistedMigrationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "invalid", reason: "not-an-object" };
  }

  const raw = value as Record<string, unknown>;
  const declared = raw.schemaVersion;

  // WHY: Pre-version rows omit schemaVersion — treat as v0 and migrate forward.
  let version = 0;
  if (declared !== undefined && declared !== null) {
    if (typeof declared !== "number" || !Number.isInteger(declared) || declared < 0) {
      return { status: "invalid", reason: "malformed-version" };
    }
    // INVARIANT: Future writers must not silently load into live state.
    if (declared > CONVERSATION_SCHEMA_VERSION) return { status: "unsupportedVersion", found: declared };
    version = declared;
  }

  let current: Record<string, unknown> = raw;
  for (let from = version; from < CONVERSATION_SCHEMA_VERSION; from++) {
    const migrate = MIGRATIONS[from];
    if (!migrate) return { status: "unsupportedVersion", found: version };
    current = migrate(current);
  }

  return { status: "ok", value: { ...current, schemaVersion: CONVERSATION_SCHEMA_VERSION } };
}

type SchemaMigration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * v0 → v1: stamp schemaVersion and heal legacy termination-reason mismatches
 * so strict lifecycle validation can reject truly corrupt rows only.
 */
const migrateV0ToV1: SchemaMigration = (raw) => {
  const runsIn = raw.runs;
  if (!runsIn || typeof runsIn !== "object" || Array.isArray(runsIn)) {
    return { ...raw, schemaVersion: 1 };
  }

  const runs: Record<string, unknown> = {};
  for (const [runId, runValue] of Object.entries(runsIn as Record<string, unknown>)) {
    if (!runValue || typeof runValue !== "object" || Array.isArray(runValue)) {
      runs[runId] = runValue;
      continue;
    }
    const run = { ...(runValue as Record<string, unknown>) };
    if (run.status === "canceled" && (run.reason === undefined || run.reason === null)) {
      run.reason = "user";
    } else if (run.status === "interrupted" && (run.reason === undefined || run.reason === null)) {
      run.reason = "crash_recovery";
    } else if (run.status === "success" || run.status === "failed" || run.status === "streaming") {
      delete run.reason;
    }
    runs[runId] = run;
  }

  return { ...raw, runs, schemaVersion: 1 };
};

/** Indexed by source version: `MIGRATIONS[n]` migrates n → n+1. */
const MIGRATIONS: Record<number, SchemaMigration> = {
  0: migrateV0ToV1,
};
