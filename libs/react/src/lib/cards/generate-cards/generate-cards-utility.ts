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
