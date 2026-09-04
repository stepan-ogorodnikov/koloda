import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { aiProfileStateAtom } from "./ai-profile-state";
import { setAssistantPromptInputAtom, startParamlessConversationAtom } from "./conversation-actions";
import { assistantCanStartNewConversationAtom, assistantPromptInputAtom } from "./conversation-selectors";
import {
  conversationsAtom,
  currentConversationIdAtom,
  pendingSaveAtom,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "./conversation-store";
import { makeConversation } from "./assistant-conversation.fixtures";

describe("mint conversation id on first non-whitespace prompt", () => {
  it("assigns an id, copies the global profile, writes the prompt, and sets updatedAt equal to createdAt", () => {
    const store = createStore();
    store.set(aiProfileStateAtom, {
      profileId: "p-global",
      modelId: "m-global",
      modelParameters: { reasoning_effort: "high" },
    });

    const mintedId = store.set(setAssistantPromptInputAtom, "  hello");

    expect(mintedId).toEqual(expect.any(String));
    expect(mintedId).not.toBe("");
    expect(store.get(currentConversationIdAtom)).toBe(mintedId);
    expect(Object.keys(store.get(conversationsAtom))).toEqual([mintedId]);

    const state = store.get(conversationsAtom)[mintedId!]!;
    expect(state.promptInput).toBe("  hello");
    expect(state.profileId).toBe("p-global");
    expect(state.modelId).toBe("m-global");
    expect(state.modelParameters).toEqual({ reasoning_effort: "high" });
    expect(state.updatedAt).toBe(state.createdAt);
    expect(state.updatedAt).not.toBeNull();
    expect(store.get(pendingSaveAtom)).toBe(0);
  });

  it("does not mint on whitespace-only edits and keeps that text on the param-less composer", () => {
    const store = createStore();

    expect(store.set(setAssistantPromptInputAtom, "   \n\t  ")).toBeNull();
    expect(store.set(setAssistantPromptInputAtom, "")).toBeNull();
    expect(store.get(currentConversationIdAtom)).toBeNull();
    expect(store.get(conversationsAtom)).toEqual({});
    expect(store.get(assistantPromptInputAtom)).toBe("");

    store.set(setAssistantPromptInputAtom, "  ");
    expect(store.get(assistantPromptInputAtom)).toBe("  ");
    expect(store.get(conversationsAtom)).toEqual({});
  });

  it("does not mint a replacement when leaving for the param-less surface", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A", { promptInput: "draft" }));
    store.set(setCurrentConversationIdAtom, "A");

    store.set(startParamlessConversationAtom);

    expect(store.get(currentConversationIdAtom)).toBeNull();
    expect(Object.keys(store.get(conversationsAtom))).toEqual(["A"]);
    expect(store.get(conversationsAtom)["A"]!.promptInput).toBe("draft");
    expect(store.get(assistantPromptInputAtom)).toBe("");
    expect(store.set(setAssistantPromptInputAtom, "\t")).toBeNull();
    expect(Object.keys(store.get(conversationsAtom))).toEqual(["A"]);
  });

  it("enables New only when a conversation id is current, including a draft with no runs", () => {
    const store = createStore();
    expect(store.get(assistantCanStartNewConversationAtom)).toBe(false);

    store.set(upsertConversationAtom, makeConversation("draft"));
    store.set(setCurrentConversationIdAtom, "draft");
    expect(store.get(conversationsAtom)["draft"]!.messages).toHaveLength(0);
    expect(store.get(conversationsAtom)["draft"]!.activeRunId).toBeNull();
    expect(store.get(assistantCanStartNewConversationAtom)).toBe(true);

    store.set(startParamlessConversationAtom);
    expect(store.get(assistantCanStartNewConversationAtom)).toBe(false);
  });
});
