import { describe, expect, it } from "vitest";
import { conversationHasTurns, toConversationListItem } from "./conversations";

describe("conversationHasTurns", () => {
  it("is false for missing, empty, or prompt-only state", () => {
    expect(conversationHasTurns(undefined)).toBe(false);
    expect(conversationHasTurns(null)).toBe(false);
    expect(conversationHasTurns("opaque")).toBe(false);
    expect(conversationHasTurns({})).toBe(false);
    expect(conversationHasTurns({ messages: [] })).toBe(false);
    expect(conversationHasTurns({ messages: [], runs: {} })).toBe(false);
    expect(conversationHasTurns({ promptInput: "draft text", messages: [] })).toBe(false);
  });

  it("is true when stored messages exist", () => {
    expect(conversationHasTurns({ messages: [{ id: "m1" }] })).toBe(true);
  });

  it("is true when runs exist and messages are not an array", () => {
    expect(conversationHasTurns({ runs: { r1: { status: "success" } } })).toBe(true);
  });
});

describe("toConversationListItem", () => {
  it("maps hasTurns from state and omits state", () => {
    const createdAt = new Date(1);
    const withTurns = toConversationListItem({
      id: "c1",
      title: "hello",
      state: { messages: [{ id: "m1" }] },
      createdAt,
      updatedAt: null,
    });
    expect(withTurns).toEqual({
      id: "c1",
      title: "hello",
      createdAt,
      updatedAt: null,
      hasTurns: true,
    });
    expect("state" in withTurns).toBe(false);

    const draft = toConversationListItem({
      id: "c2",
      title: null,
      state: { messages: [], promptInput: "soon" },
      createdAt,
      updatedAt: createdAt,
    });
    expect(draft.hasTurns).toBe(false);
  });
});
