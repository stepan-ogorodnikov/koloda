import { describe, expect, it } from "vitest";
import { conversationHasTurns, conversationIsUnread, toConversationListItem } from "./conversations";

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

describe("conversationIsUnread", () => {
  it.each([
    ["missing state", undefined, false],
    ["no runs", { messages: [], runs: {} }, false],
    ["latest run read", { runs: { r1: {}, r2: {} }, lastReadRunId: "r2" }, false],
    ["latest run not read", { runs: { r1: {}, r2: {} }, lastReadRunId: "r1" }, true],
    ["never read", { runs: { r1: { status: "success" } }, lastReadRunId: null }, true],
    // WHY: restore turns a saved streaming run into an interrupted one, which is finished.
    ["saved streaming run", { runs: { r1: { status: "streaming" } }, lastReadRunId: null }, true],
  ])("%s → %s", (_name, state, expected) => {
    expect(conversationIsUnread(state)).toBe(expected);
  });
});

describe("toConversationListItem", () => {
  it("maps hasTurns and isUnread from state and omits state", () => {
    const createdAt = new Date(1);
    const withTurns = toConversationListItem({
      id: "c1",
      title: "hello",
      state: { messages: [{ id: "m1" }], runs: { r1: {} }, lastReadRunId: null },
      createdAt,
      updatedAt: null,
    });
    expect(withTurns).toEqual({
      id: "c1",
      title: "hello",
      createdAt,
      updatedAt: null,
      hasTurns: true,
      isUnread: true,
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
