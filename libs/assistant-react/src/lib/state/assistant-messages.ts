import { getTextMessageContent } from "@koloda/ai";
import type { GeneratedCard, Message } from "@koloda/ai";
import type { Template, TemplateFields } from "@koloda/srs";
import type { TextUIPart, UIMessage } from "ai";

export type AssistantMessageMetadata = { kind: "chat-text"; runId: string };

// INVARIANT: User message `createdAt` is an ISO string, as `submitTurn`
// writes it; restore does not repair other shapes.
function parseCreatedAt(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isAssistantMetadata(value: unknown): value is AssistantMessageMetadata {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;

  if (typeof obj.runId !== "string") return false;
  return obj.kind === "chat-text";
}

export function getUserMessageCreatedAt(message: UIMessage): Date | null {
  if (!message.metadata || typeof message.metadata !== "object") return null;
  return parseCreatedAt((message.metadata as Record<string, unknown>).createdAt);
}

export function getAssistantMetadata(message: UIMessage) {
  return isAssistantMetadata(message.metadata) ? message.metadata : null;
}

export function getMessageRunId(message: UIMessage): string | null {
  if (message.role === "user") {
    if (!message.metadata || typeof message.metadata !== "object") return null;
    const runId = (message.metadata as Record<string, unknown>).runId;
    return typeof runId === "string" ? runId : null;
  }
  if (message.role === "assistant") {
    return getAssistantMetadata(message)?.runId ?? null;
  }
  return null;
}

export function userMessageId(runId: string) {
  return `user-${runId}`;
}

export function assistantMessageId(runId: string) {
  return `assistant-${runId}`;
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

export function makeHistoricalTemplate(fields: TemplateFields): Template {
  return {
    id: "01900000-0000-7000-8000-000000000000",
    title: "",
    content: {
      fields,
      layout: fields.map((field) => ({ field: field.id, operation: "display" as const })),
    },
    createdAt: new Date(0),
    updatedAt: new Date(0),
    isLocked: true,
  };
}

export function buildConversationMessages(
  messages: UIMessage[],
  runs: Record<string, { status: string; cards: GeneratedCard[]; templateFields?: TemplateFields | null }>,
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
    const run = runs[runId];

    const parts: string[] = [];
    // WHY: history matches the screen — table first, leftover note second.
    // Interrupted cards stay: the interruption is environmental (shutdown /
    // crash), not a model failure or user rejection, and the proposal
    // completed before the stream stopped. Failed/canceled stay excluded.
    if (run && (run.status === "success" || run.status === "interrupted") && run.cards.length > 0) {
      // WHY: Chat proposals serialize against the fields captured on that run.
      const cardTemplate = run.templateFields ? makeHistoricalTemplate(run.templateFields) : null;
      if (cardTemplate) {
        const cardContent = serializeGeneratedCards(run.cards, cardTemplate);
        if (cardContent) parts.push(cardContent);
      }
    }
    if (textContent) parts.push(textContent);
    if (parts.length === 0) continue;
    conversation.push({ role: "assistant", content: parts.join("\n\n") });
  }

  return conversation;
}
