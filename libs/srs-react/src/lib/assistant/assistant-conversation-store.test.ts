import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  assistantConversationStateAtom,
  bumpPendingSaveAtom,
  conversationsAtom,
  pendingSaveAtom,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "./conversation-store";
import {
  assistantActiveRunIdAtom,
  assistantConversationHasContextAtom,
  assistantIsLockedAtom,
} from "./conversation-selectors";
import { setAssistantDeckAtom, setAssistantModeAtom } from "./conversation-actions";
import { dispatchTo, makeConversation, makeRun } from "./assistant-conversation.fixtures";
import { initialConversationState } from "./conversation-reducer";

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
    store.set(assistantConversationStateAtom, [
      "addUserMessage",
      {
        runId: "r1",
        text: "Hello from A",
      },
    ]);

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
    store.set(assistantConversationStateAtom, [
      "addUserMessage",
      {
        runId: "r1",
        text: "Message in A",
      },
    ]);

    // Switch to B and add a message
    store.set(setCurrentConversationIdAtom, "B");
    store.set(assistantConversationStateAtom, [
      "addUserMessage",
      {
        runId: "r2",
        text: "Message in B",
      },
    ]);

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
    store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "run-A",
        mode: "chat",
        request: {},
      },
    ]);
    store.set(assistantConversationStateAtom, [
      "addAssistantMessage",
      {
        runId: "run-A",
        kind: "chat-text",
        text: "",
      },
    ]);

    // Switch to B
    store.set(setCurrentConversationIdAtom, "B");

    // Dispatch a text update to A (simulating a background stream chunk)
    dispatchTo(store, "A", [
      "updateAssistantText",
      {
        runId: "run-A",
        text: "Hello from background",
      },
    ]);

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
    store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "run-A",
        mode: "chat",
        request: {},
      },
    ]);

    // Switch to B
    store.set(setCurrentConversationIdAtom, "B");

    // Complete the run on A via targeted dispatch
    dispatchTo(store, "A", ["completeRun", { runId: "run-A" }]);

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
    dispatchTo(store, "UNKNOWN", [
      "addUserMessage",
      {
        runId: "r1",
        text: "This should not appear",
      },
    ]);

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
        r1: {
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
    store.set(assistantConversationStateAtom, [
      "newConversation",
      {
        id: "cold-start",
        createdAt: new Date(1),
        profileId: "p1",
        modelId: "m1",
      },
    ]);

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
    store.set(assistantConversationStateAtom, [
      "newConversation",
      {
        id: "cold-start",
        createdAt: new Date(1),
      },
    ]);

    // The writable form should now accept regular actions targeting the
    // current (newly-created) conversation. This is the path that
    // ensureConversationId → handleGenerate relies on.
    store.set(assistantConversationStateAtom, [
      "addUserMessage",
      {
        runId: "r1",
        text: "Hello",
      },
    ]);

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
        messages: [{ id: "user-r1", role: "user", parts: [{ type: "text", text: "In A" }] }],
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");

    // Start a new conversation. The old A entry must be untouched.
    store.set(assistantConversationStateAtom, [
      "newConversation",
      {
        id: "B",
        createdAt: new Date(2),
      },
    ]);

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
        messages: [{ id: "user-r1", role: "user", parts: [{ type: "text", text: "Question" }] }],
      }),
    );
    store.set(
      upsertConversationAtom,
      makeConversation("B", {
        messages: [{ id: "user-r2", role: "user", parts: [{ type: "text", text: "Different question" }] }],
      }),
    );

    // Switch to A
    store.set(setCurrentConversationIdAtom, "A");
    expect(store.get(assistantActiveRunIdAtom)).toBeNull();

    // Switch to B
    store.set(setCurrentConversationIdAtom, "B");
    expect(store.get(assistantActiveRunIdAtom)).toBeNull();

    // Start a run on B
    store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "run-B",
        mode: "chat",
        request: {},
      },
    ]);
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
    dispatchTo(store, id, ["addUserMessage", { runId: "r1", text: "Hi" }]);
    dispatchTo(store, id, ["startRun", { runId: "r1", mode: "cards", request: {} }]);
    dispatchTo(store, id, ["addAssistantMessage", { runId: "r1", kind: "generated-cards", text: "" }]);
    dispatchTo(store, id, ["completeRun", { runId: "r1" }]);
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
    dispatchTo(store, "A", ["addUserMessage", { runId: "r1", text: "Hi" }]);
    dispatchTo(store, "A", ["startRun", { runId: "r1", mode: "cards", request: {} }]);
    expect(store.get(assistantIsLockedAtom)).toBe(false);

    store.set(setAssistantDeckAtom, 9);
    expect(store.get(assistantConversationStateAtom).deckId).toBe(9);
  });
});

describe("updatedAt stamping (only on run start)", () => {
  function seedUpdatedAt(store: ReturnType<typeof createStore>, id: string) {
    const original = store.get(conversationsAtom)[id]!.updatedAt;
    dispatchTo(store, id, ["startRun", { runId: "seed", mode: "chat", request: {} }]);
    const seeded = store.get(conversationsAtom)[id]!.updatedAt;
    expect(seeded).not.toBeNull();
    expect(seeded).not.toEqual(original);
    return seeded!.getTime();
  }

  function advanceClock() {
    const t = Date.now();
    while (Date.now() === t) {
      /* spin */
    }
  }

  it("startRun bumps updatedAt", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");

    dispatchTo(store, "A", ["startRun", { runId: "r1", mode: "chat", request: {} }]);
    const after = store.get(conversationsAtom)["A"]!;
    expect(after.updatedAt).not.toBeNull();
  });

  it("restartRun bumps updatedAt", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        runs: { r1: makeRun("r1", "success") },
      }),
    );
    store.set(setCurrentConversationIdAtom, "A");
    const ts = seedUpdatedAt(store, "A");
    advanceClock();

    dispatchTo(store, "A", [
      "restartRun",
      {
        runId: "r1",
        mode: "chat",
        request: {},
        templateFields: null,
      },
    ]);
    expect(store.get(conversationsAtom)["A"]!.updatedAt!.getTime()).toBeGreaterThan(ts);
  });

  it("addUserMessage does NOT bump updatedAt", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");
    const ts = seedUpdatedAt(store, "A");
    advanceClock();

    dispatchTo(store, "A", ["addUserMessage", { runId: "r1", text: "Hi" }]);
    expect(store.get(conversationsAtom)["A"]!.updatedAt!.getTime()).toBe(ts);
  });

  it("addAssistantMessage does NOT bump updatedAt", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");
    const ts = seedUpdatedAt(store, "A");
    advanceClock();

    dispatchTo(store, "A", ["addAssistantMessage", { runId: "r1", kind: "chat-text", text: "" }]);
    expect(store.get(conversationsAtom)["A"]!.updatedAt!.getTime()).toBe(ts);
  });

  it("updateAssistantText does NOT bump updatedAt (streaming chunk)", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");
    const ts = seedUpdatedAt(store, "A");
    advanceClock();

    dispatchTo(store, "A", ["updateAssistantText", { runId: "seed", text: "chunk" }]);
    expect(store.get(conversationsAtom)["A"]!.updatedAt!.getTime()).toBe(ts);
  });

  it("addCard does NOT bump updatedAt (streaming chunk)", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");
    dispatchTo(store, "A", ["startRun", { runId: "r1", mode: "cards", request: {} }]);
    const ts = store.get(conversationsAtom)["A"]!.updatedAt!.getTime();
    advanceClock();

    dispatchTo(store, "A", ["addCard", { runId: "r1", card: { content: {} } }]);
    expect(store.get(conversationsAtom)["A"]!.updatedAt!.getTime()).toBe(ts);
  });

  it("completeRun does NOT bump updatedAt", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");
    const ts = seedUpdatedAt(store, "A");
    advanceClock();

    dispatchTo(store, "A", ["completeRun", { runId: "seed" }]);
    expect(store.get(conversationsAtom)["A"]!.updatedAt!.getTime()).toBe(ts);
  });

  it("cancelRun does NOT bump updatedAt", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");
    const ts = seedUpdatedAt(store, "A");
    advanceClock();

    dispatchTo(store, "A", ["cancelRun", { runId: "seed" }]);
    expect(store.get(conversationsAtom)["A"]!.updatedAt!.getTime()).toBe(ts);
  });

  it("dismissRunError does NOT bump updatedAt", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");
    const ts = seedUpdatedAt(store, "A");
    advanceClock();

    dispatchTo(store, "A", ["dismissRunError", { runId: "seed" }]);
    expect(store.get(conversationsAtom)["A"]!.updatedAt!.getTime()).toBe(ts);
  });

  it("setMode does NOT bump updatedAt", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");
    const ts = seedUpdatedAt(store, "A");
    advanceClock();

    dispatchTo(store, "A", ["setMode", { mode: "cards" }]);
    expect(store.get(conversationsAtom)["A"]!.updatedAt!.getTime()).toBe(ts);
  });

  it("setDeck does NOT bump updatedAt", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");
    const ts = seedUpdatedAt(store, "A");
    advanceClock();

    dispatchTo(store, "A", ["setDeck", { deckId: 42 }]);
    expect(store.get(conversationsAtom)["A"]!.updatedAt!.getTime()).toBe(ts);
  });

  it("setAIProfile does NOT bump updatedAt", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");
    const ts = seedUpdatedAt(store, "A");
    advanceClock();

    dispatchTo(store, "A", ["setAIProfile", { profileId: "p1", modelId: "m1" }]);
    expect(store.get(conversationsAtom)["A"]!.updatedAt!.getTime()).toBe(ts);
  });

  it("commitRevert does NOT bump updatedAt", () => {
    const store = createStore();
    const messages = [
      { id: "user-r1", role: "user" as const, parts: [{ type: "text" as const, text: "Hi" }] },
      { id: "assistant-r1", role: "assistant" as const, parts: [{ type: "text" as const, text: "Hello" }] },
    ];
    store.set(upsertConversationAtom, makeConversation("A", { messages, runs: { r1: makeRun("r1", "success") } }));
    store.set(setCurrentConversationIdAtom, "A");
    const ts = seedUpdatedAt(store, "A");

    dispatchTo(store, "A", ["setRevertState", { revertedToUserMessageId: "user-r1", preRevertInputText: "" }]);
    advanceClock();

    dispatchTo(store, "A", ["commitRevert"]);
    expect(store.get(conversationsAtom)["A"]!.updatedAt!.getTime()).toBe(ts);
  });
});

describe("assistantConversationHasContextAtom", () => {
  it("reports context for a specific conversation regardless of the current id", () => {
    const store = createStore();
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        messages: [{ id: "user-r1", role: "user" as const, parts: [{ type: "text" as const, text: "Hi" }] }],
      }),
    );
    store.set(upsertConversationAtom, makeConversation("B"));
    store.set(setCurrentConversationIdAtom, "B");

    expect(store.get(assistantConversationHasContextAtom("A"))).toBe(true);
    expect(store.get(assistantConversationHasContextAtom("B"))).toBe(false);
  });
});

// WHY: Revert is in-memory only (ASSISTANT-CHAT-CONVERSATIONS.md
// §Revert). It must not bump `updatedAt` and must not be persisted.
