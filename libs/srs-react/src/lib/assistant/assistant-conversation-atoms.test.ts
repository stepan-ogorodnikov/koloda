import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  assistantActiveRunIdAtom,
  assistantConversationStateAtom,
  assistantIsLockedAtom,
  bumpPendingSaveAtom,
  conversationsAtom,
  dispatchToConversationOnStore,
  pendingSaveAtom,
  setAssistantDeckAtom,
  setAssistantModeAtom,
  setCurrentConversationIdAtom,
  unreadConversationIdsAtom,
  upsertConversationAtom,
} from "./assistant-conversation-atoms";
import type { ConversationAction, ConversationState, GenerationRun } from "./conversation-state";
import { initialConversationState } from "./conversation-state";

function makeRun(id: string, status: GenerationRun["status"]): GenerationRun {
  return {
    id,
    mode: "chat",
    status,
    cards: [],
    cardStatuses: {},
    templateFields: null,
    startedAt: new Date(1),
    elapsedSeconds: status === "streaming" ? null : 1,
  };
}

function makeConversation(id: string, overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    ...initialConversationState,
    id,
    createdAt: new Date(1),
    ...overrides,
  };
}

/**
 * Helper: dispatch an action to a specific conversation via the store.
 * Mirrors how `dispatchFor` works in `useAssistantChat` (the hook now
 * delegates to `dispatchToConversationOnStore`).
 */
function dispatchTo(
  store: ReturnType<typeof createStore>,
  id: string,
  action: ConversationAction | ((prev: ConversationState) => ConversationState),
) {
  dispatchToConversationOnStore(store, id, action);
}

describe("assistantConversationStateAtom (per-conversation store)", () => {
  it("returns initialConversationState when no conversation is selected", () => {
    const store = createStore();
    expect(store.get(assistantConversationStateAtom)).toEqual(initialConversationState);
  });

  it("round-trips a dispatch through the writable atom for the current conversation", () => {
    const store = createStore();

    // Insert conversation A and make it current via public atoms
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");

    // Dispatch via the writable atom (targets current conversation)
    store.set(assistantConversationStateAtom, {
      type: "addUserMessage",
      runId: "r1",
      text: "Hello from A",
    });

    // The derived atom should reflect the change
    const state = store.get(assistantConversationStateAtom);
    expect(state.id).toBe("A");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("user");
  });

  it("switching conversations preserves both states", () => {
    const store = createStore();

    // Set up two conversations
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(upsertConversationAtom, makeConversation("B"));

    // Add a message to A
    store.set(setCurrentConversationIdAtom, "A");
    store.set(assistantConversationStateAtom, {
      type: "addUserMessage",
      runId: "r1",
      text: "Message in A",
    });

    // Switch to B and add a message
    store.set(setCurrentConversationIdAtom, "B");
    store.set(assistantConversationStateAtom, {
      type: "addUserMessage",
      runId: "r2",
      text: "Message in B",
    });

    // Switch back to A — its message should still be there
    store.set(setCurrentConversationIdAtom, "A");
    const stateA = store.get(assistantConversationStateAtom);
    expect(stateA.messages).toHaveLength(1);
    expect(stateA.messages[0].parts[0]).toEqual({ type: "text", text: "Message in A" });
  });

  it("background-stream dispatch via dispatchToConversation does not affect the current conversation", () => {
    const store = createStore();

    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(upsertConversationAtom, makeConversation("B"));

    // Start a run on A
    store.set(setCurrentConversationIdAtom, "A");
    store.set(assistantConversationStateAtom, {
      type: "startRun",
      runId: "run-A",
      mode: "chat",
      request: {},
    });
    store.set(assistantConversationStateAtom, {
      type: "addAssistantMessage",
      runId: "run-A",
      kind: "chat-text",
      text: "",
    });

    // Switch to B
    store.set(setCurrentConversationIdAtom, "B");

    // Dispatch a text update to A (simulating a background stream chunk)
    dispatchTo(store, "A", {
      type: "updateAssistantText",
      runId: "run-A",
      text: "Hello from background",
    });

    // B should be unaffected — no messages, no active run
    const stateB = store.get(assistantConversationStateAtom);
    expect(stateB.messages).toHaveLength(0);
    expect(stateB.activeRunId).toBeNull();
  });

  it("background-stream completion lands on the originating conversation", () => {
    const store = createStore();

    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(upsertConversationAtom, makeConversation("B"));

    // Start a run on A
    store.set(setCurrentConversationIdAtom, "A");
    store.set(assistantConversationStateAtom, {
      type: "startRun",
      runId: "run-A",
      mode: "chat",
      request: {},
    });

    // Switch to B
    store.set(setCurrentConversationIdAtom, "B");

    // Complete the run on A via targeted dispatch
    dispatchTo(store, "A", { type: "completeRun", runId: "run-A" });

    // A should show success — read it by switching back
    store.set(setCurrentConversationIdAtom, "A");
    const stateA = store.get(assistantConversationStateAtom);
    expect(stateA.runs["run-A"].status).toBe("success");
    expect(stateA.activeRunId).toBeNull();
  });

  it("dispatchToConversation ignores unknown conversation ids", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");

    // Dispatch to a non-existent conversation — should be a no-op
    dispatchTo(store, "UNKNOWN", {
      type: "addUserMessage",
      runId: "r1",
      text: "This should not appear",
    });

    // A should be unchanged
    const stateA = store.get(assistantConversationStateAtom);
    expect(stateA.messages).toHaveLength(0);
  });

  it("switching to a conversation already in the store keeps its state (no overwrite)", () => {
    const store = createStore();

    // Simulate a conversation with a background run still in flight
    const convA = makeConversation("A", {
      messages: [
        { id: "user-r1", role: "user", parts: [{ type: "text", text: "Hello" }] },
        { id: "assistant-r1", role: "assistant", parts: [{ type: "text", text: "Streaming..." }] },
      ],
      runs: {
        "r1": {
          id: "r1",
          mode: "chat",
          status: "streaming",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(),
          elapsedSeconds: null,
        },
      },
      activeRunId: "r1",
    });

    store.set(upsertConversationAtom, convA);

    // Switch to A — the store already has its state
    store.set(setCurrentConversationIdAtom, "A");

    // The state should be preserved
    const state = store.get(assistantConversationStateAtom);
    expect(state.id).toBe("A");
    expect(state.messages).toHaveLength(2);
    expect(state.activeRunId).toBe("r1");
    expect(state.runs["r1"].status).toBe("streaming");
  });

  it("dispatchToConversation with an updater function", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");

    dispatchTo(store, "A", (prev) => ({
      ...prev,
      mode: "cards",
    }));

    const state = store.get(assistantConversationStateAtom);
    expect(state.mode).toBe("cards");
  });

  it("a newConversation action via the writable atom populates the map and switches the current id (cold start)", () => {
    const store = createStore();
    // No conversation has been inserted or selected. The writable form
    // must accept a newConversation action and route it to the new id in
    // the map, then make that id current.
    store.set(assistantConversationStateAtom, {
      type: "newConversation",
      id: "cold-start",
      createdAt: new Date(1),
      profileId: "p1",
      modelId: "m1",
    });

    // The store now has the new conversation.
    const state = store.get(assistantConversationStateAtom);
    expect(state.id).toBe("cold-start");
    expect(state.profileId).toBe("p1");
    expect(state.modelId).toBe("m1");
    expect(state.messages).toHaveLength(0);
    expect(state.activeRunId).toBeNull();
  });

  it("subsequent dispatches after a cold-start newConversation target the new id", () => {
    const store = createStore();
    store.set(assistantConversationStateAtom, {
      type: "newConversation",
      id: "cold-start",
      createdAt: new Date(1),
    });

    // The writable form should now accept regular actions targeting the
    // current (newly-created) conversation. This is the path that
    // ensureConversationId → handleGenerate relies on.
    store.set(assistantConversationStateAtom, {
      type: "addUserMessage",
      runId: "r1",
      text: "Hello",
    });

    const state = store.get(assistantConversationStateAtom);
    expect(state.id).toBe("cold-start");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("user");
  });

  it("a newConversation action does not corrupt the currently-viewed conversation", () => {
    const store = createStore();
    // User is on conversation A with a message already.
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          { id: "user-r1", role: "user", parts: [{ type: "text", text: "In A" }] },
        ],
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    // Start a new conversation. The old A entry must be untouched.
    store.set(assistantConversationStateAtom, {
      type: "newConversation",
      id: "B",
      createdAt: new Date(2),
    });

    // The new current is B with no messages.
    const stateB = store.get(assistantConversationStateAtom);
    expect(stateB.id).toBe("B");
    expect(stateB.messages).toHaveLength(0);

    // Switch back to A and confirm it is still intact.
    store.set(setCurrentConversationIdAtom, "A");
    const stateA = store.get(assistantConversationStateAtom);
    expect(stateA.id).toBe("A");
    expect(stateA.messages).toHaveLength(1);
    expect(stateA.messages[0].parts[0]).toEqual({ type: "text", text: "In A" });
  });

  it("derived atoms follow the current conversation", () => {
    const store = createStore();

    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [
          { id: "user-r1", role: "user", parts: [{ type: "text", text: "Question" }] },
        ],
      }),
    );
    store.set(
      upsertConversationAtom,
      makeConversation("B", {
        messages: [
          { id: "user-r2", role: "user", parts: [{ type: "text", text: "Different question" }] },
        ],
      }),
    );

    // Switch to A
    store.set(setCurrentConversationIdAtom, "A");
    expect(store.get(assistantActiveRunIdAtom)).toBeNull();

    // Switch to B
    store.set(setCurrentConversationIdAtom, "B");
    expect(store.get(assistantActiveRunIdAtom)).toBeNull();

    // Start a run on B
    store.set(assistantConversationStateAtom, {
      type: "startRun",
      runId: "run-B",
      mode: "chat",
      request: {},
    });
    expect(store.get(assistantActiveRunIdAtom)).toBe("run-B");

    // Switch back to A — activeRunId should be null for A
    store.set(setCurrentConversationIdAtom, "A");
    expect(store.get(assistantActiveRunIdAtom)).toBeNull();
  });
});

describe("pendingSaveAtom (per-conversation counter)", () => {
  it("starts at 0 with no current conversation", () => {
    const store = createStore();
    expect(store.get(pendingSaveAtom)).toBe(0);
  });

  it("bumps the current conversation's counter when no current is set, the bump is a no-op", () => {
    const store = createStore();
    store.set(bumpPendingSaveAtom);
    expect(store.get(pendingSaveAtom)).toBe(0);
  });

  it("bumps the current conversation's counter and re-derives correctly", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(upsertConversationAtom, makeConversation("B"));

    store.set(setCurrentConversationIdAtom, "A");
    expect(store.get(pendingSaveAtom)).toBe(0);

    store.set(bumpPendingSaveAtom);
    store.set(bumpPendingSaveAtom);
    expect(store.get(pendingSaveAtom)).toBe(2);

    // Switch to B — its counter is 0
    store.set(setCurrentConversationIdAtom, "B");
    expect(store.get(pendingSaveAtom)).toBe(0);

    // Bump B
    store.set(bumpPendingSaveAtom);
    expect(store.get(pendingSaveAtom)).toBe(1);

    // Switch back to A — its counter is still 2
    store.set(setCurrentConversationIdAtom, "A");
    expect(store.get(pendingSaveAtom)).toBe(2);
  });

  it("write atoms (e.g. setAssistantModeAtom) bump the current conversation's counter", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(upsertConversationAtom, makeConversation("B"));

    store.set(setCurrentConversationIdAtom, "A");
    store.set(setAssistantModeAtom, "chat");
    store.set(setAssistantModeAtom, "cards");
    expect(store.get(pendingSaveAtom)).toBe(2);

    // Switch to B and bump its counter
    store.set(setCurrentConversationIdAtom, "B");
    store.set(setAssistantDeckAtom, 7);
    expect(store.get(pendingSaveAtom)).toBe(1);

    // Switch back to A — A's counter still shows 2, B's shows 1
    store.set(setCurrentConversationIdAtom, "A");
    expect(store.get(pendingSaveAtom)).toBe(2);
  });
});

describe("setAssistantDeckAtom lock check", () => {
  /**
   * Locking is enforced at the write-atom layer (not the reducer) so the
   * "what counts as locked" rule lives in one place: `assistantIsLockedAtom`.
   */
  function lockConversationWithGeneratedCards(store: ReturnType<typeof createStore>, id: string) {
    dispatchTo(store, id, { type: "addUserMessage", runId: "r1", text: "Hi" });
    dispatchTo(store, id, { type: "startRun", runId: "r1", mode: "cards", request: {} });
    dispatchTo(store, id, { type: "addAssistantMessage", runId: "r1", kind: "generated-cards", text: "" });
    dispatchTo(store, id, { type: "completeRun", runId: "r1" });
  }

  it("refuses to change the deck when a generated-cards run has completed successfully", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A", { deckId: 5 }));
    store.set(setCurrentConversationIdAtom, "A");

    expect(store.get(assistantIsLockedAtom)).toBe(false);

    lockConversationWithGeneratedCards(store, "A");
    expect(store.get(assistantIsLockedAtom)).toBe(true);

    store.set(setAssistantDeckAtom, 9);
    expect(store.get(assistantConversationStateAtom).deckId).toBe(5);
  });

  it("does not bump the pending-save counter when the deck change is rejected", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A", { deckId: 5 }));
    store.set(setCurrentConversationIdAtom, "A");

    lockConversationWithGeneratedCards(store, "A");
    expect(store.get(pendingSaveAtom)).toBe(0);

    store.set(setAssistantDeckAtom, 9);
    expect(store.get(pendingSaveAtom)).toBe(0);
  });

  it("allows the deck change when no successful generated-cards run is present", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A", { deckId: 5 }));
    store.set(setCurrentConversationIdAtom, "A");

    // User message + a started but not-yet-completed run does not lock.
    dispatchTo(store, "A", { type: "addUserMessage", runId: "r1", text: "Hi" });
    dispatchTo(store, "A", { type: "startRun", runId: "r1", mode: "cards", request: {} });
    expect(store.get(assistantIsLockedAtom)).toBe(false);

    store.set(setAssistantDeckAtom, 9);
    expect(store.get(assistantConversationStateAtom).deckId).toBe(9);
  });
});

describe("unreadConversationIdsAtom", () => {
  it("is empty when there are no conversations", () => {
    const store = createStore();
    expect(store.get(unreadConversationIdsAtom).size).toBe(0);
  });

  it("is empty when every conversation has no runs", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(upsertConversationAtom, makeConversation("B"));
    expect(store.get(unreadConversationIdsAtom).size).toBe(0);
  });

  it("is empty when the latest run on each conversation is streaming", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A", { runs: { r1: makeRun("r1", "streaming") } }));
    store.set(upsertConversationAtom, makeConversation("B", { runs: { r1: makeRun("r1", "streaming") } }));
    expect(store.get(unreadConversationIdsAtom).size).toBe(0);
  });

  it("marks a conversation unread when its latest run is finished and the user has not read it", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A", { runs: { r1: makeRun("r1", "success") } }));
    const unread = store.get(unreadConversationIdsAtom);
    expect(unread.has("A")).toBe(true);
  });

  it("does not mark a conversation unread when lastReadRunId matches the latest run", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", { runs: { r1: makeRun("r1", "success") }, lastReadRunId: "r1" }),
    );
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(false);
  });

  it("treats failed and canceled runs the same as success for the unread predicate", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A", { runs: { r1: makeRun("r1", "failed") } }));
    store.set(upsertConversationAtom, makeConversation("B", { runs: { r1: makeRun("r1", "canceled") } }));
    const unread = store.get(unreadConversationIdsAtom);
    expect(unread.has("A")).toBe(true);
    expect(unread.has("B")).toBe(true);
  });

  it("uses the last key in the runs map as the latest run id", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        runs: {
          r1: makeRun("r1", "success"),
          r2: makeRun("r2", "streaming"),
        },
      }),
    );
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(false);
  });

  it("bumps lastReadRunId to the run that just finished in the current conversation (created via newConversation)", () => {
    // WHY: When the user starts a brand-new conversation, the
    // `newConversation` action sets `currentConversationIdAtom` via the
    // writable atom's internal branch — it does NOT go through
    // `setCurrentConversationIdAtom`, so the mark-read side effect there
    // does not fire. `dispatchToConversation`'s run-completion detection
    // is the safety net: it must notice that the run finished while the
    // conversation was current and bump `lastReadRunId` itself. Without
    // this, navigating away would surface the brand-new conversation
    // as unread.
    const store = createStore();
    store.set(assistantConversationStateAtom, {
      type: "newConversation",
      id: "A",
      createdAt: new Date(1),
    });
    store.set(assistantConversationStateAtom, {
      type: "startRun",
      runId: "r1",
      mode: "chat",
      request: {},
    });
    store.set(assistantConversationStateAtom, { type: "completeRun", runId: "r1" });

    expect(store.get(conversationsAtom)["A"].lastReadRunId).toBe("r1");
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(false);
  });

  it("bumps lastReadRunId to the follow-up run that just finished in the current conversation", () => {
    // WHY: The user is on A, and A already has a previously-read run.
    // A new run starts and completes. The user is still on A, so the
    // run they just watched must end up as the new `lastReadRunId`.
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", { runs: { r1: makeRun("r1", "success") }, lastReadRunId: "r1" }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    store.set(assistantConversationStateAtom, {
      type: "startRun",
      runId: "r2",
      mode: "chat",
      request: {},
    });
    store.set(assistantConversationStateAtom, { type: "completeRun", runId: "r2" });

    expect(store.get(conversationsAtom)["A"].lastReadRunId).toBe("r2");
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(false);
  });

  it("does not bump lastReadRunId when a background run finishes in a non-current conversation", () => {
    // WHY: The auto-mark-read must only fire for the current
    // conversation. A background run that lands on a conversation the
    // user is not viewing must leave `lastReadRunId` alone so the
    // unread indicator surfaces when the user returns.
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", { runs: { r1: makeRun("r1", "success") }, lastReadRunId: "r1" }),
    );
    store.set(
      upsertConversationAtom,
      makeConversation("B", { runs: { r1: makeRun("r1", "success") } }),
    );
    store.set(setCurrentConversationIdAtom, "B");

    dispatchTo(store, "A", { type: "startRun", runId: "r2", mode: "chat", request: {} });
    dispatchTo(store, "A", { type: "completeRun", runId: "r2" });

    expect(store.get(conversationsAtom)["A"].lastReadRunId).toBe("r1");
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(true);
  });

  it("treats failed and canceled completions the same as success (auto-mark-read)", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");

    dispatchTo(store, "A", { type: "startRun", runId: "r1", mode: "chat", request: {} });
    dispatchTo(store, "A", { type: "failRun", runId: "r1" });
    expect(store.get(conversationsAtom)["A"].lastReadRunId).toBe("r1");
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(false);

    dispatchTo(store, "A", { type: "startRun", runId: "r2", mode: "chat", request: {} });
    dispatchTo(store, "A", { type: "cancelRun", runId: "r2" });
    expect(store.get(conversationsAtom)["A"].lastReadRunId).toBe("r2");
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(false);
  });

  it("does not bump lastReadRunId when restartRun flips a run back to streaming", () => {
    // WHY: A retry flips the existing run's status to "streaming" and
    // clears its content. The latest run id is unchanged, but the
    // transition goes from "success" to "streaming" — not the
    // streaming-to-finished transition the detector cares about.
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", { runs: { r1: makeRun("r1", "success") }, lastReadRunId: "r1" }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    store.set(assistantConversationStateAtom, {
      type: "restartRun",
      runId: "r1",
      mode: "chat",
      request: {},
      templateFields: null,
    });

    expect(store.get(conversationsAtom)["A"].runs["r1"].status).toBe("streaming");
    expect(store.get(conversationsAtom)["A"].lastReadRunId).toBe("r1");
  });
});

describe("setCurrentConversationIdAtom mark-read side effect", () => {
  it("marks a conversation as read when it becomes current", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A", { runs: { r1: makeRun("r1", "success") } }));
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(true);

    store.set(setCurrentConversationIdAtom, "A");

    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(false);
    expect(store.get(conversationsAtom)["A"].lastReadRunId).toBe("r1");
  });

  it("does not bump updatedAt when opening an unread conversation (regression)", () => {
    // WHY: `markRead` is a UI-only pointer update. If it stamps
    // `updatedAt`, every visit to an unread conversation would re-sort
    // it to the top of the list (which is ordered by `updatedAt` DESC),
    // defeating the unread indicator.
    const store = createStore();
    const originalUpdatedAt = new Date(1000);
    store.set(upsertConversationAtom, makeConversation("A", {
      runs: { r1: makeRun("r1", "success") },
      updatedAt: originalUpdatedAt,
    }));

    store.set(setCurrentConversationIdAtom, "A");

    const after = store.get(conversationsAtom)["A"];
    expect(after.lastReadRunId).toBe("r1");
    expect(after.updatedAt).toBe(originalUpdatedAt);
  });

  it("bumps the pending-save counter so the refreshed lastReadRunId is persisted", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A", { runs: { r1: makeRun("r1", "success") } }));
    expect(store.get(pendingSaveAtom)).toBe(0);

    store.set(setCurrentConversationIdAtom, "A");

    expect(store.get(pendingSaveAtom)).toBe(1);
  });

  it("does not bump the save when the conversation is already up-to-date", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", { runs: { r1: makeRun("r1", "success") }, lastReadRunId: "r1" }),
    );
    expect(store.get(pendingSaveAtom)).toBe(0);

    store.set(setCurrentConversationIdAtom, "A");

    expect(store.get(pendingSaveAtom)).toBe(0);
  });

  it("is a no-op for an unknown conversation id", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));

    store.set(setCurrentConversationIdAtom, "UNKNOWN");

    expect(store.get(conversationsAtom)["UNKNOWN"]).toBeUndefined();
    expect(store.get(pendingSaveAtom)).toBe(0);
  });

  it("leaves the unread set intact when switching to a conversation with a streaming run", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A", { runs: { r1: makeRun("r1", "success") } }));
    store.set(upsertConversationAtom, makeConversation("B", { runs: { r1: makeRun("r1", "streaming") } }));

    store.set(setCurrentConversationIdAtom, "B");

    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(true);
    expect(store.get(unreadConversationIdsAtom).has("B")).toBe(false);
  });

  it("clears the unread on the conversation the user lands on, but not on others", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A", { runs: { r1: makeRun("r1", "success") } }));
    store.set(upsertConversationAtom, makeConversation("B", { runs: { r1: makeRun("r1", "success") } }));

    store.set(setCurrentConversationIdAtom, "A");

    const unread = store.get(unreadConversationIdsAtom);
    expect(unread.has("A")).toBe(false);
    expect(unread.has("B")).toBe(true);
  });

  it("clears the unread when navigating back to a previously-read conversation", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A", { runs: { r1: makeRun("r1", "success") } }));

    store.set(setCurrentConversationIdAtom, "A");
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(false);

    // WHY: A is still current, so a background run completing in A
    // does not surface as unread (the user is looking at A). To exercise
    // the background-reads-as-unread path, navigate away first; that
    // also fires the markRead side effect, pinning lastReadRunId to r1.
    store.set(upsertConversationAtom, makeConversation("B", { runs: { r1: makeRun("r1", "success") } }));
    store.set(setCurrentConversationIdAtom, "B");

    dispatchTo(store, "A", { type: "startRun", runId: "r2", mode: "chat", request: {} });
    dispatchTo(store, "A", { type: "completeRun", runId: "r2" });
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(true);

    store.set(setCurrentConversationIdAtom, "A");
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(false);
    expect(store.get(conversationsAtom)["A"].lastReadRunId).toBe("r2");
  });

  it("does not change state when id is null (defensive)", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A", { runs: { r1: makeRun("r1", "success") } }));

    store.set(setCurrentConversationIdAtom, null);

    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(true);
  });

  it("a run that completes in the current conversation stays read after the user navigates away", () => {
    // WHY: A run that finishes while the user is viewing the
    // conversation is auto-marked-read by `dispatchToConversation`.
    // When the user then navigates to a different conversation, the
    // previous one must NOT surface as unread — the user already saw
    // the response.
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", { runs: { r1: makeRun("r1", "success") }, lastReadRunId: "r1" }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    dispatchTo(store, "A", { type: "startRun", runId: "r2", mode: "chat", request: {} });
    dispatchTo(store, "A", { type: "completeRun", runId: "r2" });
    expect(store.get(conversationsAtom)["A"].lastReadRunId).toBe("r2");
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(false);

    store.set(upsertConversationAtom, makeConversation("B", { runs: { r1: makeRun("r1", "success") } }));
    store.set(setCurrentConversationIdAtom, "B");

    const unread = store.get(unreadConversationIdsAtom);
    expect(unread.has("A")).toBe(false);
    expect(unread.has("B")).toBe(false);
  });
});
