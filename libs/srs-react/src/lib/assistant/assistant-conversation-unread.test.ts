import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  assistantConversationStateAtom,
  conversationsAtom,
  pendingSaveAtom,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "./conversation-store";
import { unreadConversationIdsAtom } from "./conversation-selectors";
import { dispatchTo, makeConversation, makeRun } from "./assistant-conversation.fixtures";

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
    store.set(assistantConversationStateAtom, [
      "newConversation",
      {
        id: "A",
        createdAt: new Date(1),
      },
    ]);
    store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "r1",
        mode: "chat",
        request: {},
      },
    ]);
    store.set(assistantConversationStateAtom, ["completeRun", { runId: "r1" }]);

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

    store.set(assistantConversationStateAtom, [
      "startRun",
      {
        runId: "r2",
        mode: "chat",
        request: {},
      },
    ]);
    store.set(assistantConversationStateAtom, ["completeRun", { runId: "r2" }]);

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
    store.set(upsertConversationAtom, makeConversation("B", { runs: { r1: makeRun("r1", "success") } }));
    store.set(setCurrentConversationIdAtom, "B");

    dispatchTo(store, "A", ["startRun", { runId: "r2", mode: "chat", request: {} }]);
    dispatchTo(store, "A", ["completeRun", { runId: "r2" }]);

    expect(store.get(conversationsAtom)["A"].lastReadRunId).toBe("r1");
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(true);
  });

  it("treats failed and canceled completions the same as success (auto-mark-read)", () => {
    const store = createStore();
    store.set(upsertConversationAtom, makeConversation("A"));
    store.set(setCurrentConversationIdAtom, "A");

    dispatchTo(store, "A", ["startRun", { runId: "r1", mode: "chat", request: {} }]);
    dispatchTo(store, "A", ["runFailed", { runId: "r1", error: { message: "failed" } }]);
    expect(store.get(conversationsAtom)["A"].lastReadRunId).toBe("r1");
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(false);

    dispatchTo(store, "A", ["startRun", { runId: "r2", mode: "chat", request: {} }]);
    dispatchTo(store, "A", ["cancelRun", { runId: "r2" }]);
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

    store.set(assistantConversationStateAtom, [
      "restartRun",
      {
        runId: "r1",
        mode: "chat",
        request: {},
        templateFields: null,
      },
    ]);

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
    store.set(
      upsertConversationAtom,
      makeConversation("A", {
        runs: { r1: makeRun("r1", "success") },
        updatedAt: originalUpdatedAt,
      }),
    );

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

    dispatchTo(store, "A", ["startRun", { runId: "r2", mode: "chat", request: {} }]);
    dispatchTo(store, "A", ["completeRun", { runId: "r2" }]);
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

    dispatchTo(store, "A", ["startRun", { runId: "r2", mode: "chat", request: {} }]);
    dispatchTo(store, "A", ["completeRun", { runId: "r2" }]);
    expect(store.get(conversationsAtom)["A"].lastReadRunId).toBe("r2");
    expect(store.get(unreadConversationIdsAtom).has("A")).toBe(false);

    store.set(upsertConversationAtom, makeConversation("B", { runs: { r1: makeRun("r1", "success") } }));
    store.set(setCurrentConversationIdAtom, "B");

    const unread = store.get(unreadConversationIdsAtom);
    expect(unread.has("A")).toBe(false);
    expect(unread.has("B")).toBe(false);
  });
});

// WHY: ASSISTANT-CHAT-CONVERSATIONS.md §Conversation List — "The timestamp
// is bumped only when a new run starts". Every other action (streaming
// chunks, completions, cancellations, deck/mode/profile changes, etc.)
// must NOT touch updatedAt.
