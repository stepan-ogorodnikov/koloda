import { conversationHasTurns, conversationListItemSchema, conversationRowSchema, throwKnownError } from "@koloda/app";
import type { DeleteConversationData, SetConversationData } from "@koloda/app";
import { CONVERSATION_SELECT } from "./columns";
import type { DB } from "./db";
import { parseRow, parseRowOrNull, parseRows } from "./parse-rows";
import { nowMs } from "./sql";

export async function getConversation(db: DB, id: string) {
  return throwKnownError("db.get", async () => {
    const result = await db.get(`SELECT ${CONVERSATION_SELECT} FROM conversations WHERE id = ? LIMIT 1`, [id]);
    return parseRowOrNull(conversationRowSchema, result);
  });
}

export async function getConversations(db: DB) {
  return throwKnownError("db.get", async () => {
    const result = await db.all(
      `SELECT ${CONVERSATION_SELECT} FROM conversations ORDER BY updated_at DESC, created_at DESC`,
    );
    const rows = parseRows(conversationRowSchema, result);
    return parseRows(
      conversationListItemSchema,
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        hasTurns: conversationHasTurns(row.state),
      })),
    );
  });
}

export async function setConversation(db: DB, { id, state, title, updatedAt }: SetConversationData) {
  return throwKnownError("db.update", async () => {
    const now = nowMs();
    const nextUpdatedAt = updatedAt ? updatedAt.getTime() : now;

    await db.run(
      `INSERT INTO conversations (id, title, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         state = excluded.state,
         updated_at = excluded.updated_at`,
      [id, title ?? null, JSON.stringify(state), now, nextUpdatedAt],
    );

    const result = await getConversation(db, id);
    return parseRow(conversationRowSchema, result);
  });
}

export async function deleteConversation(db: DB, { id }: DeleteConversationData) {
  return throwKnownError("db.delete", async () => {
    await db.run(`DELETE FROM conversations WHERE id = ?`, [id]);
  });
}
