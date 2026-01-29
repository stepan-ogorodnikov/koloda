import { sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { schema } from "./schema";

type Schema = typeof schema;
export type DB = PgliteDatabase<Schema>;

/**
 * Adds an updatedAt timestamp field to the provided data record
 * @param data - The data record to augment with updatedAt timestamp
 * @returns A new record with the 'updatedAt' field added
 */
export function withUpdatedAt(data: Record<string, unknown>) {
  return { ...data, updatedAt: sql`CURRENT_TIMESTAMP` };
}
