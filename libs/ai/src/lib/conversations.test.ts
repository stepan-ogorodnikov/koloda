import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { computeConversationTitle } from "./conversations";

function userMessage(text: string): UIMessage {
  return {
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

describe("computeConversationTitle", () => {
  it("uses the prompt when there is no user message", () => {
    expect(computeConversationTitle({ messages: [], promptInput: "  hello   world  " })).toBe("hello world");
  });

  it("stores a null title when the prompt is missing, empty, or whitespace-only", () => {
    expect(computeConversationTitle({ messages: [] })).toBeNull();
    expect(computeConversationTitle({ messages: [], promptInput: "" })).toBeNull();
    expect(computeConversationTitle({ messages: [], promptInput: "  \n\t  " })).toBeNull();
  });

  it("truncates a prompt at 255 characters the same way as a user message", () => {
    const atLimit = "a".repeat(255);
    const overLimit = "a".repeat(256);
    expect(computeConversationTitle({ messages: [], promptInput: atLimit })).toBe(atLimit);
    expect(computeConversationTitle({ messages: [], promptInput: overLimit })).toBe(`${"a".repeat(254)}…`);
    expect(computeConversationTitle({ messages: [userMessage(atLimit)] })).toBe(atLimit);
    expect(computeConversationTitle({ messages: [userMessage(overLimit)] })).toBe(`${"a".repeat(254)}…`);
  });

  it("keeps the first user message after later prompt edits", () => {
    expect(
      computeConversationTitle({
        messages: [userMessage("first turn")],
        promptInput: "a later draft",
      }),
    ).toBe("first turn");
  });
});
