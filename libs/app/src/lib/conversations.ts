import { z } from "zod";
import { timestampsValidation } from "./db";
import type { Timestamps } from "./db";

const conversationIdentitySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  ...timestampsValidation.shape,
});

export type ConversationListItem = Timestamps & {
  id: string;
  title: string | null;
  hasTurns: boolean;
};

export type Conversation = Timestamps & {
  id: string;
  title: string | null;
  state: unknown;
};

export const conversationListItemSchema = conversationIdentitySchema.extend({
  hasTurns: z.boolean(),
});

export const conversationRowSchema = conversationIdentitySchema.extend({
  // WHY: Conversation state is validated at restore (srs-react), not at the DB boundary.
  state: z.unknown(),
});

export type SetConversationData = {
  id: string;
  state: unknown;
  title?: string | null;
  updatedAt?: Date | null;
};

export type DeleteConversationData = Pick<Conversation, "id">;

const ACTIVE_CONVERSATION_ID_KEY = "activeConversationId";

export function getActiveConversationId() {
  try {
    return localStorage.getItem(ACTIVE_CONVERSATION_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveConversationId(id: string) {
  try {
    localStorage.setItem(ACTIVE_CONVERSATION_ID_KEY, id);
  } catch {}
}

export function clearActiveConversationId() {
  try {
    localStorage.removeItem(ACTIVE_CONVERSATION_ID_KEY);
  } catch {}
}

// INVARIANT: Draft = no submitted run. Derive from stored messages (and runs
// when messages are absent). Do not parse conversation `state` in Rust.
export function conversationHasTurns(state: unknown): boolean {
  if (state == null || typeof state !== "object") return false;
  const record = state as Record<string, unknown>;
  if (Array.isArray(record.messages) && record.messages.length > 0) return true;
  const runs = record.runs;
  if (runs != null && typeof runs === "object" && !Array.isArray(runs)) {
    return Object.keys(runs).length > 0;
  }
  return false;
}

export function toConversationListItem(row: Conversation): ConversationListItem {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    hasTurns: conversationHasTurns(row.state),
  };
}
