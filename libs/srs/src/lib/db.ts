import { sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { schema } from "./schema";

type Schema = typeof schema;
export type DB = PgliteDatabase<Schema>;

export function handleDBError(error: unknown) {
  console.error(error);
  throw error;
}

export const TIMESTAMPS = { createdAt: true, updatedAt: true } as const;

export function withUpdatedAt(data: Record<string, unknown>) {
  return { ...data, updatedAt: sql`CURRENT_TIMESTAMP` };
}
