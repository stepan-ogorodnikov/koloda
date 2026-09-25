import type { GeneratedCard } from "@koloda/ai";
import type { TemplateFields } from "@koloda/srs";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { createGeneratedCard, createTemplate, testId } from "../../test/test-helpers";
import { SEED_TEMPLATE_TYPE_BACK_FIELD_ID, SEED_TEMPLATE_TYPE_FRONT_FIELD_ID } from "@koloda/app";
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
  it.each([
    { shape: "an ISO string", createdAt: "2026-07-18T11:00:00.000Z" as string | Date },
    { shape: "a Date left by wire revival", createdAt: new Date("2026-07-18T11:00:00.000Z") },
  ])("reads createdAt when metadata stores $shape", ({ createdAt }) => {
    const message = createTextMessage("user-1", "user", "Hello", {
      createdAt,
      runId: "1",
    });

    expect(getUserMessageCreatedAt(message)?.toISOString()).toBe("2026-07-18T11:00:00.000Z");
    expect(getMessageRunId(message)).toBe("1");
  });

  it("returns null createdAt when user metadata omits it", () => {
    expect(getUserMessageCreatedAt(createTextMessage("user-2", "user", "Hello"))).toBeNull();
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

  it("serializes generated cards in template field order", () => {
    const template = createTemplate();
    const cards = [
      createGeneratedCard({
        content: {
          [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: "Question one" },
          [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: "Answer one" },
        },
      }),
      createGeneratedCard({
        content: {
          [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: "Question two" },
          [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: "Answer two" },
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
  { id: testId(1), title: "Front", type: "text", isRequired: true },
  { id: testId(2), title: "Back", type: "text", isRequired: true },
];

const cardWithContent: GeneratedCard = {
  content: {
    [testId(1)]: { text: "Question" },
    [testId(2)]: { text: "Answer" },
  },
};

const cardMarkdown = "## Card 1\n**Front**: Question\n**Back**: Answer";

function successCardsRun(cards: GeneratedCard[] = [cardWithContent]) {
  return createRunData({ status: "success", cards, templateFields: cardTemplateFields });
}

describe("buildConversationMessages", () => {
  it.each<{ role: "user" | "assistant"; text: string; expected: { role: string; content: string }[] }>([
    { role: "user", text: "What is 2+2?", expected: [{ role: "user", content: "What is 2+2?" }] },
    { role: "user", text: "   ", expected: [] },
    {
      role: "assistant",
      text: "The answer is 4.",
      expected: [{ role: "assistant", content: "The answer is 4." }],
    },
    { role: "assistant", text: "  ", expected: [] },
  ])("includes $role text and skips empty content", ({ role, text, expected }) => {
    const message = role === "user" ? userMessage("m1", text) : assistantChatTextMessage("m1", "r1", text);
    expect(buildConversationMessages([message], {})).toEqual(expected);
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

  it.each<{
    label: string;
    status: string;
    cards: GeneratedCard[];
    text: string;
    expected: { role: "assistant"; content: string }[];
  }>([
    {
      label: "success with cards and no leftover text",
      status: "success",
      cards: [cardWithContent],
      text: "",
      expected: [{ role: "assistant", content: cardMarkdown }],
    },
    {
      label: "failed with cards and no leftover text",
      status: "failed",
      cards: [cardWithContent],
      text: "",
      expected: [],
    },
    {
      label: "canceled with cards and no leftover text",
      status: "canceled",
      cards: [cardWithContent],
      text: "",
      expected: [],
    },
    {
      label: "interrupted with cards and no leftover text",
      status: "interrupted",
      cards: [cardWithContent],
      text: "",
      expected: [{ role: "assistant", content: cardMarkdown }],
    },
    {
      label: "success with no cards and no leftover text",
      status: "success",
      cards: [],
      text: "",
      expected: [],
    },
    {
      label: "success with cards and leftover text",
      status: "success",
      cards: [cardWithContent],
      text: "I skipped a duplicate.",
      expected: [{ role: "assistant", content: `${cardMarkdown}\n\nI skipped a duplicate.` }],
    },
    {
      label: "success with cards and whitespace-only prose",
      status: "success",
      cards: [cardWithContent],
      text: "  ",
      expected: [{ role: "assistant", content: cardMarkdown }],
    },
    {
      label: "failed with cards and leftover text",
      status: "failed",
      cards: [cardWithContent],
      text: "I started some cards.",
      expected: [{ role: "assistant", content: "I started some cards." }],
    },
    {
      label: "canceled with cards and leftover text",
      status: "canceled",
      cards: [cardWithContent],
      text: "Partial.",
      expected: [{ role: "assistant", content: "Partial." }],
    },
    {
      label: "interrupted with cards and leftover text",
      status: "interrupted",
      cards: [cardWithContent],
      text: "Partial.",
      expected: [{ role: "assistant", content: `${cardMarkdown}\n\nPartial.` }],
    },
  ])("builds chat-text history for $label", ({ status, cards, text, expected }) => {
    const result = buildConversationMessages([assistantChatTextMessage("a1", "r1", text)], {
      r1: createRunData({
        status,
        cards,
        ...(cards.length > 0 ? { templateFields: cardTemplateFields } : {}),
      }),
    });
    expect(result).toEqual(expected);
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

  it("serializes chat-text cards with run.templateFields", () => {
    const runFields = [
      { id: testId(10), title: "Prompt", type: "text" as const, isRequired: true },
      { id: testId(11), title: "Response", type: "text" as const, isRequired: true },
    ];
    const proposedCard: GeneratedCard = {
      content: {
        [testId(10)]: { text: "hola" },
        [testId(11)]: { text: "hello" },
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
