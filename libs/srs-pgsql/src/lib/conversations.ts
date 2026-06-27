import { type DeleteConversationData, type SetConversationData, throwKnownError } from "@koloda/app";
import { eq, sql } from "drizzle-orm";
import type { DB } from "./db";
import { withUpdatedAt } from "./db";
import { conversations } from "./schema";

export async function getConversation(db: DB, id: string) {
  return throwKnownError("db.get", async () => {
    const result = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    return result[0] ?? null;
  });
}

export async function getConversations(db: DB) {
  return throwKnownError("db.get", async () => {
    return db
      .select()
      .from(conversations)
      .orderBy(
        sql`${conversations.updatedAt} DESC NULLS LAST`,
        sql`${conversations.createdAt} DESC NULLS LAST`,
      );
  });
}

export async function setConversation(db: DB, { id, state, updatedAt }: SetConversationData) {
  return throwKnownError("db.update", async () => {
    const insertValues = {
      id,
      state,
      updatedAt: updatedAt ?? new Date(),
    };
    const result = await db
      .insert(conversations)
      .values(insertValues)
      .onConflictDoUpdate({
        target: conversations.id,
        set: updatedAt
          ? { state, updatedAt }
          : withUpdatedAt({ state }),
      })
      .returning();

    return result[0];
  });
}

export async function deleteConversation(db: DB, { id }: DeleteConversationData) {
  return throwKnownError("db.delete", async () => {
    await db.delete(conversations).where(eq(conversations.id, id));
  });
}
