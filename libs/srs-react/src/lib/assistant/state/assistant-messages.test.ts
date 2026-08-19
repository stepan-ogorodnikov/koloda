import { getTextMessageContent } from "@koloda/ai";
import type { GeneratedCard } from "@koloda/ai";
import type { TemplateFields } from "@koloda/srs";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { createGeneratedCard, createTemplate } from "../../../test/test-helpers";
import {
  backfillUserMessageRunIds,
  buildConversationMessages,
  createTextMessage,
  getErrorMetadata,
  getMessageRunId,
  getUserMessageCreatedAt,
  serializeGeneratedCards,
} from "./assistant-messages";

describe("aiChatUtility", () => {
  it("reads createdAt from user message metadata", () => {
    const message = createTextMessage("user-1", "user", "Hello", {
      createdAt: "2026-07-18T11:00:00.000Z",
      runId: "1",
    });

    expect(getUserMessageCreatedAt(message)?.toISOString()).toBe("2026-07-18T11:00:00.000Z");
    expect(getUserMessageCreatedAt(createTextMessage("user-2", "user", "Hello"))).toBeNull();
  });

  it("reads createdAt when wire revival left a Date instead of an ISO string", () => {
    const message = createTextMessage("user-1", "user", "Hello", {
      createdAt: new Date("2026-07-18T11:00:00.000Z"),
      runId: "1",
    });

    expect(getUserMessageCreatedAt(message)?.toISOString()).toBe("2026-07-18T11:00:00.000Z");
    expect(getMessageRunId(message)).toBe("1");
  });

  it("reads runId from user and assistant message metadata", () => {
    const user = createTextMessage("user-r1", "user", "Hi", {
      createdAt: "2026-07-18T11:00:00.000Z",
      runId: "r1",
    });
    const assistant = createTextMessage("assistant-r1", "assistant", "Hello", {
      kind: "chat-text",
      runId: "r1",
    });

    expect(getMessageRunId(user)).toBe("r1");
    expect(getMessageRunId(assistant)).toBe("r1");
    expect(getMessageRunId(createTextMessage("user-r1", "user", "Hi"))).toBeNull();
  });

  it("backfills runId onto legacy user messages from the message id", () => {
    const legacy = createTextMessage("user-r1", "user", "Hi", {
      createdAt: "2026-07-01T11:00:00.000Z",
    });
    const [backfilled] = backfillUserMessageRunIds([legacy]);
    expect(backfilled.metadata).toEqual({
      createdAt: "2026-07-01T11:00:00.000Z",
      runId: "r1",
    });
    const already = [backfilled];
    expect(backfillUserMessageRunIds(already)).toBe(already);
  });

  it("re-stringifies Date createdAt and heals epoch from run startedAt", () => {
    const realIso = "2026-07-18T11:00:00.000Z";
    const withDate = createTextMessage("user-r1", "user", "Hi", {
      createdAt: new Date(realIso),
      runId: "r1",
    });
    const [normalized] = backfillUserMessageRunIds([withDate]);
    expect(normalized.metadata).toEqual({ createdAt: realIso, runId: "r1" });

    const corrupted = createTextMessage("user-r2", "user", "Hi", {
      createdAt: "1970-01-01T00:00:00.000Z",
      runId: "r2",
    });
    const [healed] = backfillUserMessageRunIds([corrupted], { r2: new Date(realIso) });
    expect(healed.metadata).toEqual({ createdAt: realIso, runId: "r2" });
  });

  it("reads error metadata from error assistant messages", () => {
    const message = createTextMessage("assistant-1", "assistant", "", {
      kind: "error",
      runId: "run-1",
    });

    expect(getErrorMetadata(message)).toEqual({ kind: "error", runId: "run-1" });
    expect(getErrorMetadata(createTextMessage("assistant-2", "assistant", "ready"))).toBeNull();
  });

  it("creates and extracts text message content without noise from non-text parts", () => {
    const message = {
      ...createTextMessage("user-1", "user", "  First line  "),
      parts: [
        { type: "text", text: "  First line  " },
        { type: "reasoning", text: "ignored" },
        { type: "text", text: "  Second line " },
      ],
    } as UIMessage;

    expect(message.parts[0]).toEqual({ type: "text", text: "  First line  " });
    expect(getTextMessageContent(message)).toBe("First line\n\nSecond line");
  });

  it("serializes generated cards in template field order", () => {
    const template = createTemplate();
    const cards = [
      createGeneratedCard({
        content: {
          "1": { text: "Question one" },
          "2": { text: "Answer one" },
        },
      }),
      createGeneratedCard({
        content: {
          "1": { text: "Question two" },
          "2": { text: "Answer two" },
        },
      }),
    ];

    expect(serializeGeneratedCards(cards, template)).toBe(
      "## Card 1\n**Front**: Question one\n**Back**: Answer one\n\n" +
        "## Card 2\n**Front**: Question two\n**Back**: Answer two",
    );
  });
});

function userMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
  } as UIMessage;
}

function assistantChatTextMessage(id: string, runId: string, text: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
    metadata: { kind: "chat-text", runId },
  } as UIMessage;
}

function assistantErrorMessage(id: string, runId: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text: "" }],
    metadata: { kind: "error", runId },
  } as UIMessage;
}

function createRunData(
  overrides: Partial<{ status: string; cards: GeneratedCard[]; templateFields: TemplateFields | null }> = {},
): {
  status: string;
  cards: GeneratedCard[];
  templateFields?: TemplateFields | null;
} {
  return { status: "success", cards: [], ...overrides };
}

const cardTemplateFields: TemplateFields = [
  { id: 1, title: "Front", type: "text", isRequired: true },
  { id: 2, title: "Back", type: "text", isRequired: true },
];

const cardWithContent: GeneratedCard = {
  content: {
    "1": { text: "Question" },
    "2": { text: "Answer" },
  },
};

function successCardsRun(cards: GeneratedCard[] = [cardWithContent]) {
  return createRunData({ status: "success", cards, templateFields: cardTemplateFields });
}

describe("buildConversationMessages", () => {
  it("includes user messages with text content", () => {
    const result = buildConversationMessages([userMessage("u1", "What is 2+2?")], {});
    expect(result).toEqual([{ role: "user", content: "What is 2+2?" }]);
  });

  it("skips user messages with empty content", () => {
    const result = buildConversationMessages([userMessage("u1", "   ")], {});
    expect(result).toEqual([]);
  });

  it("includes assistant chat-text messages with text", () => {
    const result = buildConversationMessages([assistantChatTextMessage("a1", "r1", "The answer is 4.")], {});
    expect(result).toEqual([{ role: "assistant", content: "The answer is 4." }]);
  });

  it("skips assistant chat-text messages with empty content", () => {
    const result = buildConversationMessages([assistantChatTextMessage("a1", "r1", "  ")], {});
    expect(result).toEqual([]);
  });

  it("skips messages without assistant metadata", () => {
    const msg: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "No metadata" }],
    } as UIMessage;
    const result = buildConversationMessages([msg], {});
    expect(result).toEqual([]);
  });

  it("includes chat-text card markdown when the run succeeded and has cards", () => {
    const result = buildConversationMessages([assistantChatTextMessage("a1", "r1", "")], { r1: successCardsRun() });
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
    expect(result[0].content).toContain("## Card 1");
    expect(result[0].content).toContain("**Front**");
    expect(result[0].content).toContain("**Back**");
  });

  it("skips chat-text card markdown when run status is not success", () => {
    const result = buildConversationMessages([assistantChatTextMessage("a1", "r1", "")], {
      r1: createRunData({ status: "failed", cards: [cardWithContent] }),
    });
    expect(result).toEqual([]);
  });

  it("skips chat-text card markdown when run has no cards and no leftover text", () => {
    const result = buildConversationMessages([assistantChatTextMessage("a1", "r1", "")], {
      r1: createRunData({ status: "success", cards: [] }),
    });
    expect(result).toEqual([]);
  });

  it("skips chat-text card markdown when run does not exist", () => {
    const result = buildConversationMessages([assistantChatTextMessage("a1", "missing", "")], {});
    expect(result).toEqual([]);
  });

  it("skips chat-text card markdown when the run has no templateFields", () => {
    const result = buildConversationMessages([assistantChatTextMessage("a1", "r1", "")], {
      r1: createRunData({ status: "success", cards: [cardWithContent] }),
    });
    expect(result).toEqual([]);
  });

  it("skips non-assistant/non-user messages", () => {
    const msg: UIMessage = {
      id: "s1",
      role: "system",
      parts: [{ type: "text", text: "System message" }],
    } as UIMessage;
    const result = buildConversationMessages([msg], {});
    expect(result).toEqual([]);
  });

  it("handles mixed conversation ordering correctly", () => {
    const messages = [
      userMessage("u1", "Generate some cards"),
      assistantChatTextMessage("a1", "r-chat", "Sure!"),
      assistantChatTextMessage("a2", "r-cards", ""),
    ];
    const runs = {
      "r-chat": createRunData(),
      "r-cards": successCardsRun(),
    };

    const result = buildConversationMessages(messages, runs);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ role: "user", content: "Generate some cards" });
    expect(result[1]).toEqual({ role: "assistant", content: "Sure!" });
    expect(result[2].content).toContain("## Card 1");
  });

  it("skips assistant error messages when building history", () => {
    const messages = [userMessage("u1", "What is 2+2?"), assistantErrorMessage("a1", "r1")];
    const result = buildConversationMessages(messages, {});
    expect(result).toEqual([{ role: "user", content: "What is 2+2?" }]);
  });

  it("includes successful card markdown, then leftover assistant text", () => {
    const result = buildConversationMessages([assistantChatTextMessage("a1", "r1", "I skipped a duplicate.")], {
      r1: successCardsRun(),
    });
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
    expect(result[0].content).toBe("## Card 1\n**Front**: Question\n**Back**: Answer\n\nI skipped a duplicate.");
  });

  it("includes successful chat-text cards when the prose is empty", () => {
    const result = buildConversationMessages([assistantChatTextMessage("a1", "r1", "  ")], { r1: successCardsRun() });
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("## Card 1");
    expect(result[0].content).not.toContain("\n\n");
  });

  it("keeps leftover text from a failed chat-text run that proposed cards", () => {
    const result = buildConversationMessages([assistantChatTextMessage("a1", "r1", "I started some cards.")], {
      r1: createRunData({ status: "failed", cards: [cardWithContent] }),
    });
    expect(result).toEqual([{ role: "assistant", content: "I started some cards." }]);
  });

  it("keeps leftover text from canceled and interrupted chat-text runs that proposed cards", () => {
    expect(
      buildConversationMessages([assistantChatTextMessage("a1", "r1", "Partial.")], {
        r1: createRunData({ status: "canceled", cards: [cardWithContent] }),
      }),
    ).toEqual([{ role: "assistant", content: "Partial." }]);
    expect(
      buildConversationMessages([assistantChatTextMessage("a1", "r1", "Partial.")], {
        r1: createRunData({ status: "interrupted", cards: [cardWithContent] }),
      }),
    ).toEqual([{ role: "assistant", content: "Partial." }]);
  });

  it("serializes chat-text cards with run.templateFields", () => {
    const runFields = [
      { id: 10, title: "Prompt", type: "text" as const, isRequired: true },
      { id: 11, title: "Response", type: "text" as const, isRequired: true },
    ];
    const proposedCard: GeneratedCard = {
      content: {
        "10": { text: "hola" },
        "11": { text: "hello" },
      },
    };
    const result = buildConversationMessages([assistantChatTextMessage("a1", "r1", "Proposed.")], {
      r1: createRunData({ status: "success", cards: [proposedCard], templateFields: runFields }),
    });
    expect(result[0].content).toContain("**Prompt**: hola");
    expect(result[0].content).toContain("**Response**: hello");
    expect(result[0].content).not.toContain("**Front**");
    expect(result[0].content.startsWith("## Card 1")).toBe(true);
    expect(result[0].content.endsWith("Proposed.")).toBe(true);
  });
});
