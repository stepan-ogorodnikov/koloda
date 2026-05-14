import type { GeneratedCard } from "@koloda/ai";
import type { Template } from "@koloda/srs";
import { DEFAULT_TEMPLATE } from "@koloda/srs";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { buildConversationMessages } from "./use-conversation";

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

function createRunData(
  overrides: Partial<{ status: string; cards: GeneratedCard[] }> = {},
): { status: string; cards: GeneratedCard[] } {
  return { status: "success", cards: [], ...overrides };
}

const template = structuredClone(DEFAULT_TEMPLATE) as Template;
template.content.fields = [
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
      template,
    );
    expect(result).toEqual([{ role: "user", content: "What is 2+2?" }]);
  });

  it("skips user messages with empty content", () => {
    const result = buildConversationMessages(
      [userMessage("u1", "   ")],
      {},
      template,
    );
    expect(result).toEqual([]);
  });

  it("includes assistant chat-text messages with text", () => {
    const result = buildConversationMessages(
      [assistantChatTextMessage("a1", "r1", "The answer is 4.")],
      {},
      template,
    );
    expect(result).toEqual([{ role: "assistant", content: "The answer is 4." }]);
  });

  it("skips assistant chat-text messages with empty content", () => {
    const result = buildConversationMessages(
      [assistantChatTextMessage("a1", "r1", "  ")],
      {},
      template,
    );
    expect(result).toEqual([]);
  });

  it("skips messages without assistant metadata", () => {
    const msg: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "No metadata" }],
    } as UIMessage;
    const result = buildConversationMessages([msg], {}, template);
    expect(result).toEqual([]);
  });

  it("includes generated-cards messages when run succeeded and has cards", () => {
    const result = buildConversationMessages(
      [assistantGeneratedCardsMessage("a1", "r1")],
      { r1: createRunData({ status: "success", cards: [cardWithContent] }) },
      template,
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
      template,
    );
    expect(result).toEqual([]);
  });

  it("skips generated-cards messages when run has no cards", () => {
    const result = buildConversationMessages(
      [assistantGeneratedCardsMessage("a1", "r1")],
      { r1: createRunData({ status: "success", cards: [] }) },
      template,
    );
    expect(result).toEqual([]);
  });

  it("skips generated-cards messages when run does not exist", () => {
    const result = buildConversationMessages(
      [assistantGeneratedCardsMessage("a1", "missing")],
      {},
      template,
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
    const result = buildConversationMessages([msg], {}, template);
    expect(result).toEqual([]);
  });

  it("handles mixed conversation ordering correctly", () => {
    const messages = [
      userMessage("u1", "Generate some cards"),
      assistantChatTextMessage("a1", "r1", "Sure!"),
      assistantGeneratedCardsMessage("a2", "r1"),
    ];
    const runs = { r1: createRunData({ status: "success", cards: [cardWithContent] }) };

    const result = buildConversationMessages(messages, runs, template);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ role: "user", content: "Generate some cards" });
    expect(result[1]).toEqual({ role: "assistant", content: "Sure!" });
    expect(result[2].content).toContain("## Card 1");
  });
});
