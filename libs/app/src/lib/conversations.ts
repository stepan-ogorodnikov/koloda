import { z } from "zod";
import { timestampsValidation } from "./db";
import type { Timestamps } from "./db";

export type ConversationListItem = Timestamps & {
  id: string;
  title: string | null;
};

export type Conversation = ConversationListItem & {
  state: unknown;
};

export const conversationListItemSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  ...timestampsValidation.shape,
});

export const conversationRowSchema = conversationListItemSchema.extend({
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
