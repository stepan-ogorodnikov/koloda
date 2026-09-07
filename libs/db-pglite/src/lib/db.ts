import { sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { schema } from "./schema";

type Schema = typeof schema;
export type DB = PgliteDatabase<Schema>;

export function withUpdatedAt(data: Record<string, unknown>) {
  return { ...data, updatedAt: sql`CURRENT_TIMESTAMP` };
}
