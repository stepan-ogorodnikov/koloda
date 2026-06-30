import type { TextUIPart, UIMessage } from "ai";

export function getTextMessageContent(message: UIMessage): string {
  return message.parts
    .filter((part): part is TextUIPart => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

const TITLE_MAX_LENGTH = 255;
const COLLAPSE_WHITESPACE = /\s+/g;

export type ConversationLike = {
  messages: UIMessage[];
};

export function getConversationName(state: ConversationLike, fallback: string) {
  const name = computeConversationTitle(state);
  return name ?? fallback;
}

/**
 * Computes the conversation's displayable title from its first user message.
 * Returns `null` when the conversation has no user message with text content,
 * so callers can distinguish "no title" from the i18n fallback string and
 * avoid persisting the fallback into the database.
 */
export function computeConversationTitle(state: ConversationLike): string | null {
  const firstUser = state.messages.find((m) => m.role === "user");
  if (!firstUser) return null;

  const text = getTextMessageContent(firstUser).trim().replace(COLLAPSE_WHITESPACE, " ");
  if (!text) return null;

  if (text.length <= TITLE_MAX_LENGTH) return text;
  return `${text.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}
