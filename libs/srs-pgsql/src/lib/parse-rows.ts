import { z } from "zod";

/**
 * Runtime tripwire gate.
 *
 * The `assert*` helpers validate DB rows against their domain schema in dev
 * and tests (where shape drift is caught by the integration suite), but skip
 * the parse in production for performance. This is safe ONLY because:
 *  - writes are already validated by the same zod schemas (`*insertSchema` / `*updateSchema`);
 *  - typed Drizzle `.select().from(table)` / `.returning()` paths infer the row
 *    shape from the table schema, so dropping a column is a compile-time error.
 *
 * Default-on: validates unless `NODE_ENV` is explicitly `"production"`, so a
 * misconfigured environment stays safe.
 */
const ASSERT_ENABLED = typeof process === "undefined" || !process.env ? true : process.env.NODE_ENV !== "production";

// ─────────────────────────────────────────────────────────────────────────────
// `parse*` — mandatory boundary parse for rows of UNKNOWN shape.
//
// Use these for raw SQL (`db.execute(sql`...`)`, `result.rows`) and any path
// where Drizzle cannot type the output. The parse is load-bearing: never gate
// it behind the dev flag.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a single DB row of unknown shape.
 * ZodErrors propagate through `throwKnownError`.
 */
export function parseRow<S extends z.ZodType>(schema: S, row: unknown): z.infer<S> {
  return schema.parse(row);
}

/**
 * Parse many DB rows of unknown shape.
 */
export function parseRows<S extends z.ZodType>(schema: S, rows: unknown[]): z.infer<S>[] {
  return rows.map((row) => schema.parse(row));
}

/**
 * Parse a row of unknown shape, or return null when missing (get-by-id style).
 */
export function parseRowOrNull<S extends z.ZodType>(schema: S, row: unknown | null | undefined): z.infer<S> | null {
  return row == null ? null : schema.parse(row);
}

/**
 * Parse a row of unknown shape, or return undefined when missing.
 */
export function parseRowOrUndefined<S extends z.ZodType>(
  schema: S,
  row: unknown | null | undefined,
): z.infer<S> | undefined {
  return row == null ? undefined : schema.parse(row);
}

// ─────────────────────────────────────────────────────────────────────────────
// `assert*` — dev-gated tripwire for rows whose shape Drizzle already types.
//
// Use these for typed `.select().from(table)` and `.returning()` paths. The
// runtime parse is a tripwire that catches schema/type drift in dev and tests;
// production builds skip it to avoid per-row parsing cost on list reads.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assert a row Drizzle already types matches the domain schema.
 * Parses in dev/test (surfaces drift), casts in production.
 */
export function assertRow<S extends z.ZodType>(schema: S, row: unknown | null | undefined): z.infer<S> {
  // WHY: assertRow is "a row is required". An empty `.returning()` means the
  // WHERE matched nothing — surface that deterministically in every env
  // rather than letting dev throw ZodError and prod silently return undefined.
  // Plain Error so throwKnownError wraps with the caller's db.add / db.update / db.get.
  if (row == null) throw new Error("no row returned by returning()");
  return ASSERT_ENABLED ? schema.parse(row) : (row as z.infer<S>);
}

/**
 * Assert many typed rows match the domain schema.
 */
export function assertRows<S extends z.ZodType>(schema: S, rows: unknown[]): z.infer<S>[] {
  if (!ASSERT_ENABLED) return rows as z.infer<S>[];
  return rows.map((row) => schema.parse(row));
}

/**
 * Assert a typed row, or return null when missing.
 */
export function assertRowOrNull<S extends z.ZodType>(schema: S, row: unknown | null | undefined): z.infer<S> | null {
  if (row == null) return null;
  return ASSERT_ENABLED ? schema.parse(row) : (row as z.infer<S>);
}

/**
 * Assert a typed row, or return undefined when missing.
 */
export function assertRowOrUndefined<S extends z.ZodType>(
  schema: S,
  row: unknown | null | undefined,
): z.infer<S> | undefined {
  if (row == null) return undefined;
  return ASSERT_ENABLED ? schema.parse(row) : (row as z.infer<S>);
}
