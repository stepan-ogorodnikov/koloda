import type { TextUIPart, UIMessage } from "ai";

export function getTextMessageContent(message: UIMessage): string {
  return message.parts
    .filter((part): part is TextUIPart => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

const MAX_LENGTH = 48;
const COLLAPSE_WHITESPACE = /\s+/g;

export type ConversationLike = {
  messages: UIMessage[];
};

export function getConversationName(
  state: ConversationLike,
  fallback: string,
): string {
  const firstUser = state.messages.find((m) => m.role === "user");
  if (!firstUser) return fallback;

  const text = getTextMessageContent(firstUser).trim().replace(COLLAPSE_WHITESPACE, " ");
  if (!text) return fallback;

  if (text.length <= MAX_LENGTH) return text;
  return `${text.slice(0, MAX_LENGTH - 1).trimEnd()}…`;
}
