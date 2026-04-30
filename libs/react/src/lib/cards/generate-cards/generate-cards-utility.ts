import type { GeneratedCard, Template } from "@koloda/srs";
import type { TextUIPart, UIMessage } from "ai";

export type GenerationMode = "chat" | "generate";

export type AssistantMessageMetadata =
  | { kind: "generated-cards"; runId: string }
  | { kind: "chat-text"; runId: string };

function isAssistantMetadata(value: unknown): value is AssistantMessageMetadata {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    (obj.kind === "generated-cards" || obj.kind === "chat-text")
    && typeof obj.runId === "string"
  );
}

export function getAssistantMetadata(message: UIMessage) {
  return isAssistantMetadata(message.metadata) ? message.metadata : null;
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

export function createTextMessage(
  id: string,
  role: UIMessage["role"],
  text: string,
  metadata?: UIMessage["metadata"],
): UIMessage {
  const part: TextUIPart = { type: "text", text };
  return { id, role, metadata, parts: [part] };
}

export function getTextMessageContent(message: UIMessage) {
  return message.parts
    .filter((part): part is TextUIPart => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function serializeGeneratedCards(cards: GeneratedCard[], template: Template) {
  return cards.map((card, index) =>
    [
      `## Card ${index + 1}`,
      ...template.content.fields.map((field) => {
        const value = card.content[field.id]?.text?.trim() ?? "";
        return `**${field.title}**: ${value}`;
      }),
    ].join("\n")
  ).join("\n\n");
}
