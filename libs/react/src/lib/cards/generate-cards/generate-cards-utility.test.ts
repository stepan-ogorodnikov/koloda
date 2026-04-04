import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { createGeneratedCard, createTemplate } from "../../../test/test-helpers";
import {
  createTextMessage,
  getGeneratedCardsMetadata,
  getTextMessageContent,
  serializeGeneratedCards,
} from "./generate-cards-utility";

describe("generateCardsUtility", () => {
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
