import { sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { schema } from "./schema";

type Schema = typeof schema;
export type DB = PgliteDatabase<Schema>;

/**
 * Handles database errors by logging them and rethrowing
 * @param error - The error object to handle
 */
export function handleDBError(error: unknown) {
  console.error(error);
  throw error;
}

export const TIMESTAMPS = { createdAt: true, updatedAt: true } as const;

/**
 * Adds an updatedAt timestamp field to the provided data record
 * @param data - The data record to augment with updatedAt timestamp
 * @returns A new record with the 'updatedAt' field added
 */
export function withUpdatedAt(data: Record<string, unknown>) {
  return { ...data, updatedAt: sql`CURRENT_TIMESTAMP` };
}
