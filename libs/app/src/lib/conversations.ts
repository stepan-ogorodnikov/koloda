import type { Timestamps } from "./db";

export type Conversation = Timestamps & {
  id: string;
  state: unknown;
};

export type SetConversationData = {
  id: string;
  state: unknown;
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
