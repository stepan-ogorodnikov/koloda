import type { z } from "zod";
import type { SqlRow, SqlValue } from "./db";

// INVARIANT: these key sets mirror how the shared V*.sql series stores each column (agents/DB.md).
// Do not trim keys that look unused — on-disk rows depend on every branch below.
// WHY: FSRS numeric columns coerce NULL to 0 because cards.stability/difficulty are
// nullable in V1 (legacy rows); desktop loads NULL as 0.0 the same way
// (crates/koloda/src/repo/cards.rs) — divergence would fail restored rows at schema.parse.
// WHY: "state" is deliberately in both JSON_KEYS and ZERO_KEYS: conversations.state
// is JSON text, cards.state/reviews.state are integers whose NULL means "new" (0).
const DATE_KEYS = new Set(["createdAt", "updatedAt", "dueAt", "lastReviewedAt"]);
const JSON_KEYS = new Set(["content", "state"]);
const BOOL_KEYS = new Set(["isIgnored", "isLocked"]);
const ZERO_KEYS = new Set([
  "stability",
  "difficulty",
  "scheduledDays",
  "learningSteps",
  "reps",
  "lapses",
  "time",
  "state",
]);

function asNumber(value: SqlValue): number {
  return Number(value);
}

export function mapSqliteRow(row: SqlRow): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value == null) {
      mapped[key] = ZERO_KEYS.has(key) ? 0 : null;
      continue;
    }
    if (DATE_KEYS.has(key) && (typeof value === "number" || typeof value === "bigint")) {
      mapped[key] = new Date(asNumber(value));
      continue;
    }
    if (JSON_KEYS.has(key) && typeof value === "string") {
      mapped[key] = JSON.parse(value);
      continue;
    }
    if (BOOL_KEYS.has(key)) {
      mapped[key] = value === 1;
      continue;
    }
    if (typeof value === "bigint") {
      mapped[key] = Number(value);
      continue;
    }
    mapped[key] = value;
  }
  return mapped;
}

export function parseRow<S extends z.ZodType>(schema: S, row: unknown): z.infer<S> {
  if (row == null) throw new Error("no row returned");
  const mapped = typeof row === "object" ? mapSqliteRow(row as SqlRow) : row;
  return schema.parse(mapped);
}

export function parseRows<S extends z.ZodType>(schema: S, rows: unknown[]): z.infer<S>[] {
  return rows.map((row) => parseRow(schema, row));
}

export function parseRowOrNull<S extends z.ZodType>(schema: S, row: unknown | null | undefined): z.infer<S> | null {
  return row == null ? null : parseRow(schema, row);
}

export function parseRowOrUndefined<S extends z.ZodType>(
  schema: S,
  row: unknown | null | undefined,
): z.infer<S> | undefined {
  return row == null ? undefined : parseRow(schema, row);
}
