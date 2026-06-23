import type { GeneratedCard } from "@koloda/ai";
import type { Template } from "@koloda/srs";
import { DEFAULT_TEMPLATE } from "@koloda/srs";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { createGeneratedCard, createTemplate } from "../../test/test-helpers";
import {
  buildConversationMessages,
  createTextMessage,
  getErrorMetadata,
  getGeneratedCardsMetadata,
  getTextMessageContent,
  serializeGeneratedCards,
} from "./assistant-messages";

describe("aiChatUtility", () => {
  it("reads generated-card metadata only from matching assistant messages", () => {
    const message = createTextMessage("assistant-1", "assistant", "ready", {
      kind: "generated-cards",
      runId: "run-1",
    });

    expect(getGeneratedCardsMetadata(message)).toEqual({
      kind: "generated-cards",
      runId: "run-1",
    });
    expect(getGeneratedCardsMetadata(createTextMessage("assistant-2", "assistant", "ready"))).toBeNull();
  });

  it("reads error metadata from error assistant messages", () => {
    const message = createTextMessage("assistant-1", "assistant", "", {
      kind: "error",
      runId: "run-1",
      mode: "chat",
    });

    expect(getErrorMetadata(message)).toEqual({ kind: "error", runId: "run-1", mode: "chat" });
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
      "## Card 1\n**Front**: Question one\n**Back**: Answer one\n\n"
        + "## Card 2\n**Front**: Question two\n**Back**: Answer two",
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

function assistantGeneratedCardsMessage(id: string, runId: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text: "" }],
    metadata: { kind: "generated-cards", runId },
  } as UIMessage;
}

function assistantErrorMessage(id: string, runId: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text: "" }],
    metadata: { kind: "error", runId, mode: "chat" },
  } as UIMessage;
}

function createRunData(
  overrides: Partial<{ status: string; cards: GeneratedCard[] }> = {},
): { status: string; cards: GeneratedCard[] } {
  return { status: "success", cards: [], ...overrides };
}

const buildTemplate = structuredClone(DEFAULT_TEMPLATE) as Template;
buildTemplate.content.fields = [
  { id: 1, title: "Front", type: "text", isRequired: true },
  { id: 2, title: "Back", type: "text", isRequired: true },
];

const cardWithContent: GeneratedCard = {
  content: {
    "1": { text: "Question" },
    "2": { text: "Answer" },
  },
};

describe("buildConversationMessages", () => {
  it("includes user messages with text content", () => {
    const result = buildConversationMessages(
      [userMessage("u1", "What is 2+2?")],
      {},
      buildTemplate,
    );
    expect(result).toEqual([{ role: "user", content: "What is 2+2?" }]);
  });

  it("skips user messages with empty content", () => {
    const result = buildConversationMessages(
      [userMessage("u1", "   ")],
      {},
      buildTemplate,
    );
    expect(result).toEqual([]);
  });

  it("includes assistant chat-text messages with text", () => {
    const result = buildConversationMessages(
      [assistantChatTextMessage("a1", "r1", "The answer is 4.")],
      {},
      buildTemplate,
    );
    expect(result).toEqual([{ role: "assistant", content: "The answer is 4." }]);
  });

  it("skips assistant chat-text messages with empty content", () => {
    const result = buildConversationMessages(
      [assistantChatTextMessage("a1", "r1", "  ")],
      {},
      buildTemplate,
    );
    expect(result).toEqual([]);
  });

  it("skips messages without assistant metadata", () => {
    const msg: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "No metadata" }],
    } as UIMessage;
    const result = buildConversationMessages([msg], {}, buildTemplate);
    expect(result).toEqual([]);
  });

  it("includes generated-cards messages when run succeeded and has cards", () => {
    const result = buildConversationMessages(
      [assistantGeneratedCardsMessage("a1", "r1")],
      { r1: createRunData({ status: "success", cards: [cardWithContent] }) },
      buildTemplate,
    );
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
    expect(result[0].content).toContain("## Card 1");
    expect(result[0].content).toContain("**Front**");
    expect(result[0].content).toContain("**Back**");
  });

  it("skips generated-cards messages when run status is not success", () => {
    const result = buildConversationMessages(
      [assistantGeneratedCardsMessage("a1", "r1")],
      { r1: createRunData({ status: "failed", cards: [cardWithContent] }) },
      buildTemplate,
    );
    expect(result).toEqual([]);
  });

  it("skips generated-cards messages when run has no cards", () => {
    const result = buildConversationMessages(
      [assistantGeneratedCardsMessage("a1", "r1")],
      { r1: createRunData({ status: "success", cards: [] }) },
      buildTemplate,
    );
    expect(result).toEqual([]);
  });

  it("skips generated-cards messages when run does not exist", () => {
    const result = buildConversationMessages(
      [assistantGeneratedCardsMessage("a1", "missing")],
      {},
      buildTemplate,
    );
    expect(result).toEqual([]);
  });

  it("skips generated-cards messages when template is null", () => {
    const result = buildConversationMessages(
      [assistantGeneratedCardsMessage("a1", "r1")],
      { r1: createRunData({ status: "success", cards: [cardWithContent] }) },
      null,
    );
    expect(result).toEqual([]);
  });

  it("skips non-assistant/non-user messages", () => {
    const msg: UIMessage = {
      id: "s1",
      role: "system",
      parts: [{ type: "text", text: "System message" }],
    } as UIMessage;
    const result = buildConversationMessages([msg], {}, buildTemplate);
    expect(result).toEqual([]);
  });

  it("handles mixed conversation ordering correctly", () => {
    const messages = [
      userMessage("u1", "Generate some cards"),
      assistantChatTextMessage("a1", "r1", "Sure!"),
      assistantGeneratedCardsMessage("a2", "r1"),
    ];
    const runs = { r1: createRunData({ status: "success", cards: [cardWithContent] }) };

    const result = buildConversationMessages(messages, runs, buildTemplate);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ role: "user", content: "Generate some cards" });
    expect(result[1]).toEqual({ role: "assistant", content: "Sure!" });
    expect(result[2].content).toContain("## Card 1");
  });

  it("skips assistant error messages when building history", () => {
    const messages = [
      userMessage("u1", "What is 2+2?"),
      assistantErrorMessage("a1", "r1"),
    ];
    const result = buildConversationMessages(messages, {}, buildTemplate);
    expect(result).toEqual([{ role: "user", content: "What is 2+2?" }]);
  });

  it("skips assistant error messages in cards mode when building history", () => {
    const cardError: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "" }],
      metadata: { kind: "error", runId: "r1", mode: "cards" },
    } as UIMessage;
    const messages = [
      userMessage("u1", "Make cards"),
      cardError,
    ];
    const result = buildConversationMessages(messages, {}, buildTemplate);
    expect(result).toEqual([{ role: "user", content: "Make cards" }]);
  });
});
