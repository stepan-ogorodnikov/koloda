import { throwKnownError, type DeleteConversationData, type SetConversationData } from "@koloda/app";
import { desc, eq } from "drizzle-orm";
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
      .orderBy(desc(conversations.updatedAt), desc(conversations.createdAt));
  });
}

export async function setConversation(db: DB, { id, state }: SetConversationData) {
  return throwKnownError("db.update", async () => {
    const result = await db
      .insert(conversations)
      .values({ id, state })
      .onConflictDoUpdate({
        target: conversations.id,
        set: withUpdatedAt({ state }),
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
