import { getTextMessageContent } from "@koloda/ai";
import type { GeneratedCard, Message } from "@koloda/ai";
import type { AIChatMode } from "@koloda/ai";
import type { Template } from "@koloda/srs";
import type { TextUIPart, UIMessage } from "ai";

export type AssistantMessageMetadata =
  | { kind: "generated-cards"; runId: string }
  | { kind: "chat-text"; runId: string }
  | { kind: "error"; runId: string; mode: AIChatMode };

export type UserMessageMetadata = { createdAt: string; runId: string };

function isAssistantMetadata(value: unknown): value is AssistantMessageMetadata {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;

  if (typeof obj.runId !== "string") return false;
  if (obj.kind === "generated-cards" || obj.kind === "chat-text") return true;
  if (obj.kind === "error") return obj.mode === "chat" || obj.mode === "cards";

  return false;
}

function isUserMessageMetadata(value: unknown): value is UserMessageMetadata {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;

  return typeof obj.createdAt === "string" && typeof obj.runId === "string";
}

export function getUserMessageCreatedAt(message: UIMessage): Date | null {
  if (!message.metadata || typeof message.metadata !== "object") return null;
  const createdAt = (message.metadata as Record<string, unknown>).createdAt;
  if (typeof createdAt !== "string") return null;
  const date = new Date(createdAt);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function getAssistantMetadata(message: UIMessage) {
  return isAssistantMetadata(message.metadata) ? message.metadata : null;
}

/** Run id from message metadata (user or assistant). Null when missing or not a chat message. */
export function getMessageRunId(message: UIMessage): string | null {
  if (message.role === "user") {
    return isUserMessageMetadata(message.metadata) ? message.metadata.runId : null;
  }
  if (message.role === "assistant") {
    return getAssistantMetadata(message)?.runId ?? null;
  }
  return null;
}

/**
 * Stamp `runId` on legacy user messages that only encoded it in the id
 * (`user-<runId>`). Used by restore normalization so drop/revert can rely on
 * metadata. Returns the same array reference when nothing changes.
 */
export function backfillUserMessageRunIds(messages: UIMessage[]): UIMessage[] {
  let changed = false;
  const next = messages.map((m) => {
    if (m.role !== "user") return m;
    if (isUserMessageMetadata(m.metadata)) return m;
    if (!m.id.startsWith("user-")) return m;
    const runId = m.id.slice("user-".length);
    if (!runId) return m;

    const createdAt =
      m.metadata &&
      typeof m.metadata === "object" &&
      typeof (m.metadata as Record<string, unknown>).createdAt === "string"
        ? ((m.metadata as Record<string, unknown>).createdAt as string)
        : new Date(0).toISOString();

    changed = true;
    return { ...m, metadata: { createdAt, runId } satisfies UserMessageMetadata };
  });
  return changed ? next : messages;
}

export function getGeneratedCardsMetadata(
  message: UIMessage,
): Extract<AssistantMessageMetadata, { kind: "generated-cards" }> | null {
  const metadata = getAssistantMetadata(message);
  return metadata?.kind === "generated-cards" ? metadata : null;
}

export function getChatTextMetadata(
  message: UIMessage,
): Extract<AssistantMessageMetadata, { kind: "chat-text" }> | null {
  const metadata = getAssistantMetadata(message);
  return metadata?.kind === "chat-text" ? metadata : null;
}

export function getErrorMetadata(message: UIMessage): Extract<AssistantMessageMetadata, { kind: "error" }> | null {
  const metadata = getAssistantMetadata(message);
  return metadata?.kind === "error" ? metadata : null;
}

export function userMessageId(runId: string) {
  return `user-${runId}`;
}

export function assistantMessageId(runId: string) {
  return `assistant-${runId}`;
}

export function modeToMessageKind(mode: AIChatMode): "generated-cards" | "chat-text" {
  return mode === "cards" ? "generated-cards" : "chat-text";
}

export function getEffectiveChatMode(mode: AIChatMode, deckId: number | null): AIChatMode {
  return mode === "cards" && deckId !== null ? "cards" : "chat";
}

export function createTextMessage(
  id: string,
  role: UIMessage["role"],
  text: string,
  metadata?: UIMessage["metadata"],
): UIMessage {
  const part: TextUIPart = { type: "text", text };
  return { id, role, metadata, parts: [part] };
}

export function serializeGeneratedCards(cards: GeneratedCard[], template: Template) {
  return cards
    .map((card, index) =>
      [
        `## Card ${index + 1}`,
        ...template.content.fields.map((field) => {
          const value = card.content[field.id]?.text?.trim() ?? "";
          return `**${field.title}**: ${value}`;
        }),
      ].join("\n"),
    )
    .join("\n\n");
}

export function buildConversationMessages(
  messages: UIMessage[],
  runs: Record<string, { status: string; cards: GeneratedCard[] }>,
  template: Template | null | undefined,
) {
  const conversation: Message[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      const content = getTextMessageContent(message);
      if (content) conversation.push({ role: "user", content });
      continue;
    }

    if (message.role !== "assistant") continue;

    const metadata = getAssistantMetadata(message);
    if (!metadata) continue;

    const { runId } = metadata;
    const textContent = getTextMessageContent(message);

    if (metadata.kind === "chat-text") {
      if (textContent) conversation.push({ role: "assistant", content: textContent });
      continue;
    }

    if (metadata.kind === "error") continue;

    const run = runs[runId];
    if (!run || run.status !== "success" || run.cards.length === 0) continue;

    if (!template) continue;
    const cardContent = serializeGeneratedCards(run.cards, template);
    if (cardContent) conversation.push({ role: "assistant", content: cardContent });
  }

  return conversation;
}
