import { getTextMessageContent } from "@koloda/ai";
import type { GeneratedCard, Message } from "@koloda/ai";
import type { AIChatMode } from "@koloda/ai";
import type { Template, TemplateFields } from "@koloda/srs";
import type { TextUIPart, UIMessage } from "ai";

export type AssistantMessageMetadata =
  | { kind: "generated-cards"; runId: string }
  | { kind: "chat-text"; runId: string }
  | { kind: "error"; runId: string; mode: AIChatMode };

export type UserMessageMetadata = { createdAt: string; runId: string };

// INVARIANT: Fallback only when no real createdAt / run.startedAt is available.
const EPOCH_ISO = new Date(0).toISOString();

// WHY: Accept string / Date / epoch-ms so Electron `fromWire` revival and legacy rows round-trip.
function coerceCreatedAtToIso(value: unknown): string | null {
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

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

  // INVARIANT: Canonical in-memory shape — createdAt must already be an ISO string.
  return (
    typeof obj.createdAt === "string" && typeof obj.runId === "string" && coerceCreatedAtToIso(obj.createdAt) !== null
  );
}

export function getUserMessageCreatedAt(message: UIMessage): Date | null {
  if (!message.metadata || typeof message.metadata !== "object") return null;
  const iso = coerceCreatedAtToIso((message.metadata as Record<string, unknown>).createdAt);
  return iso ? new Date(iso) : null;
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

// WHY: Stamp `runId` on legacy `user-<runId>` ids and normalize createdAt after Electron wire revival.
// `startedAtByRunId` heals epoch / missing createdAt from the paired run. Returns the same array when unchanged.
export function backfillUserMessageRunIds(
  messages: UIMessage[],
  startedAtByRunId?: Readonly<Record<string, Date>>,
): UIMessage[] {
  let changed = false;
  const next = messages.map((m) => {
    if (m.role !== "user") return m;

    const meta = m.metadata && typeof m.metadata === "object" ? (m.metadata as Record<string, unknown>) : null;
    const existingRunId = typeof meta?.runId === "string" ? meta.runId : null;
    const runIdFromId = m.id.startsWith("user-") ? m.id.slice("user-".length) : "";
    const runId = existingRunId ?? (runIdFromId || null);
    if (!runId) return m;

    const coerced = meta ? coerceCreatedAtToIso(meta.createdAt) : null;
    const startedAt = startedAtByRunId?.[runId];
    const createdAt =
      coerced && coerced !== EPOCH_ISO
        ? coerced
        : startedAt && !Number.isNaN(startedAt.getTime())
          ? startedAt.toISOString()
          : (coerced ?? EPOCH_ISO);

    const alreadyCanonical =
      isUserMessageMetadata(m.metadata) &&
      (m.metadata as UserMessageMetadata).createdAt === createdAt &&
      (m.metadata as UserMessageMetadata).runId === runId;
    if (alreadyCanonical) return m;

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

export function makeHistoricalTemplate(fields: TemplateFields): Template {
  return {
    id: 0,
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
    const run = runs[runId];

    if (metadata.kind === "chat-text") {
      const parts: string[] = [];
      if (textContent) parts.push(textContent);
      if (run && run.status === "success" && run.cards.length > 0) {
        // WHY: Chat proposals carry the target deck's fields on the run. Using the
        // conversation template would serialize against the picker's template instead.
        const cardTemplate = run.templateFields ? makeHistoricalTemplate(run.templateFields) : template;
        if (cardTemplate) {
          const cardContent = serializeGeneratedCards(run.cards, cardTemplate);
          if (cardContent) parts.push(cardContent);
        }
      }
      if (parts.length === 0) continue;
      conversation.push({ role: "assistant", content: parts.join("\n\n") });
      continue;
    }

    if (metadata.kind === "error") continue;

    if (!run || run.status !== "success" || run.cards.length === 0) continue;

    if (!template) continue;
    const cardContent = serializeGeneratedCards(run.cards, template);
    if (cardContent) conversation.push({ role: "assistant", content: cardContent });
  }

  return conversation;
}
