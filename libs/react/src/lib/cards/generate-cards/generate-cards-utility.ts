import type { GeneratedCard, Template } from "@koloda/srs";
import type { TextUIPart, UIMessage } from "ai";

export type GeneratedCardsMessageMetadata = {
  kind: "generated-cards";
  runId: string;
};

export function getGeneratedCardsMetadata(message: UIMessage): GeneratedCardsMessageMetadata | null {
  const metadata = message.metadata as GeneratedCardsMessageMetadata | undefined;
  return (!metadata || metadata.kind !== "generated-cards") ? null : metadata;
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

export function getTextMessageContent(message: UIMessage): string {
  return message.parts
    .filter((part): part is TextUIPart => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function serializeGeneratedCards(cards: GeneratedCard[], template: Template): string {
  return cards.map((card, index) => [
    `## Card ${index + 1}`,
    ...template.content.fields.map((field) => {
      const value = card.content[field.id]?.text?.trim() ?? "";
      return `**${field.title}**: ${value}`;
    }),
  ].join("\n")).join("\n\n");
}
