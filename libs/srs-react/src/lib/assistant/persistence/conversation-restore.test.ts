import { describe, expect, it } from "vitest";
import { fromPersistedState, normalizeRestoredConversation, toPersistedState } from "./conversation-persistence";
import { coerceConversationState } from "./conversation-persistence-schema";
import type { RestoreIssue } from "./conversation-persistence-schema";
import { CONVERSATION_SCHEMA_VERSION } from "./conversation-schema-version";
import type { DataAccessSnapshot } from "../runs/data-access";
import { findLatestErroredRun, initialConversationState } from "../state/conversation-reducer";
import type { ConversationReducerState } from "../state/conversation-reducer";

/** Returns the state of an `ok` restore result, failing the test otherwise. */
function expectOk(value: unknown): ConversationReducerState {
  const result = coerceConversationState(value);
  if (result.status !== "ok") {
    throw new Error(`expected restore result "ok", got ${JSON.stringify(result)}`);
  }
  return result.state;
}

/** Returns the issues of a `corrupt` restore result, failing the test otherwise. */
function expectCorrupt(value: unknown): RestoreIssue[] {
  const result = coerceConversationState(value);
  if (result.status !== "corrupt") {
    throw new Error(`expected restore result "corrupt", got ${JSON.stringify(result)}`);
  }
  return result.issues;
}

describe("toPersistedState / fromPersistedState", () => {
  it("omits revertState on the way out and restores it as null on the way in", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      revertState: { revertedToUserMessageId: "user-r1", preRevertInputText: "draft" },
    };
    const persisted = toPersistedState(state);
    expect("revertState" in persisted).toBe(false);
    expect(persisted.schemaVersion).toBe(CONVERSATION_SCHEMA_VERSION);
    expect(fromPersistedState(persisted).revertState).toBeNull();
    expect(fromPersistedState(persisted)).not.toHaveProperty("schemaVersion");
  });
});

describe("coerceConversationState", () => {
  it("accepts a valid conversation shape with Date timestamps", () => {
    const state = {
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date(1),
    };
    expect(coerceConversationState(state).status).toBe("ok");
  });

  it("classifies an absent row (undefined) as missing", () => {
    expect(coerceConversationState(undefined)).toEqual({ status: "missing" });
  });

  it("classifies non-object rows as corrupt with non-empty issues", () => {
    expect(expectCorrupt(null).length).toBeGreaterThan(0);
    expect(expectCorrupt("string").length).toBeGreaterThan(0);
    expect(expectCorrupt(123).length).toBeGreaterThan(0);
    expect(expectCorrupt([]).length).toBeGreaterThan(0);
  });

  it("rejects objects with wrong field types as corrupt", () => {
    expect(expectCorrupt({ ...initialConversationState, id: 123 }).length).toBeGreaterThan(0);
    expect(expectCorrupt({ ...initialConversationState, mode: "voice" }).length).toBeGreaterThan(0);
    expect(expectCorrupt({ ...initialConversationState, deckId: "5" }).length).toBeGreaterThan(0);
    expect(expectCorrupt({ ...initialConversationState, profileId: 5 }).length).toBeGreaterThan(0);
    expect(expectCorrupt({ ...initialConversationState, modelId: 7 }).length).toBeGreaterThan(0);
    expect(expectCorrupt({ ...initialConversationState, modelParameters: "x" }).length).toBeGreaterThan(0);
    expect(
      expectCorrupt({ ...initialConversationState, modelParameters: { reasoning_effort: 5 } }).length,
    ).toBeGreaterThan(0);
  });

  it("coerces ISO string createdAt into a Date", () => {
    const iso = "2024-01-01T00:00:00.000Z";
    const coerced = expectOk({
      ...initialConversationState,
      id: "conv-1",
      createdAt: iso,
    });
    expect(coerced.createdAt).toBeInstanceOf(Date);
    expect(coerced.createdAt.toISOString()).toBe(iso);
  });

  it("coerces number createdAt into a Date", () => {
    const coerced = expectOk({
      ...initialConversationState,
      id: "conv-1",
      createdAt: 1700000000000,
    });
    expect(coerced.createdAt).toBeInstanceOf(Date);
    expect(coerced.createdAt.getTime()).toBe(1700000000000);
  });

  it("accepts rows that omit the AI configuration fields", () => {
    const coerced = expectOk({ ...initialConversationState, id: "conv-1", createdAt: new Date(1) });
    expect(coerced.id).toBe("conv-1");
  });

  it("defaults missing AI configuration fields to null and an empty map", () => {
    const coerced = expectOk({
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date(1),
    });
    expect(coerced.profileId).toBeNull();
    expect(coerced.modelId).toBeNull();
    expect(coerced.modelParameters).toEqual({});
  });

  it("preserves stored AI profile, model, and model parameters", () => {
    const coerced = expectOk({
      ...initialConversationState,
      id: "conv-1",
      createdAt: new Date(1),
      profileId: "prof-1",
      modelId: "model-1",
      modelParameters: { reasoning_effort: "high" },
    });
    expect(coerced.profileId).toBe("prof-1");
    expect(coerced.modelId).toBe("model-1");
    expect(coerced.modelParameters).toEqual({ reasoning_effort: "high" });
  });

  describe("lastReadRunId coercion", () => {
    it("defaults lastReadRunId to null when the field is missing", () => {
      const coerced = expectOk({
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
      });
      expect(coerced.lastReadRunId).toBeNull();
    });

    it("accepts an explicit null lastReadRunId", () => {
      const coerced = expectOk({
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        lastReadRunId: null,
      });
      expect(coerced.lastReadRunId).toBeNull();
    });

    it("preserves a string lastReadRunId", () => {
      const coerced = expectOk({
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        lastReadRunId: "r-42",
      });
      expect(coerced.lastReadRunId).toBe("r-42");
    });

    it("rejects a non-string, non-null lastReadRunId as corrupt", () => {
      expect(
        expectCorrupt({
          ...initialConversationState,
          id: "conv-1",
          createdAt: new Date(1),
          lastReadRunId: 42,
        }).length,
      ).toBeGreaterThan(0);
      expect(
        expectCorrupt({
          ...initialConversationState,
          id: "conv-1",
          createdAt: new Date(1),
          lastReadRunId: true,
        }).length,
      ).toBeGreaterThan(0);
      expect(
        expectCorrupt({
          ...initialConversationState,
          id: "conv-1",
          createdAt: new Date(1),
          lastReadRunId: {},
        }).length,
      ).toBeGreaterThan(0);
    });
  });

  describe("run modelName coercion", () => {
    function makeStateWithRun(run: Record<string, unknown>) {
      return {
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        messages: [],
        runs: { r1: run },
      };
    }

    function baseRun(overrides: Record<string, unknown> = {}) {
      return {
        id: "r1",
        mode: "chat",
        status: "success",
        cards: [],
        cardStatuses: {},
        templateFields: null,
        startedAt: new Date(1),
        elapsedSeconds: 1,
        ...overrides,
      };
    }

    it("preserves a string modelName on a run", () => {
      const coerced = expectOk(makeStateWithRun(baseRun({ modelName: "GPT-4" })));
      expect(coerced.runs["r1"].modelName).toBe("GPT-4");
    });

    it("defaults modelName to undefined when the field is missing", () => {
      const coerced = expectOk(makeStateWithRun(baseRun()));
      expect(coerced.runs["r1"].modelName).toBeUndefined();
    });

    it("accepts explicit null and coerces it to undefined", () => {
      const coerced = expectOk(makeStateWithRun(baseRun({ modelName: null })));
      expect(coerced.runs["r1"].modelName).toBeUndefined();
    });

    it("rejects a non-string modelName as corrupt", () => {
      expect(expectCorrupt(makeStateWithRun(baseRun({ modelName: 5 }))).length).toBeGreaterThan(0);
      expect(expectCorrupt(makeStateWithRun(baseRun({ modelName: true }))).length).toBeGreaterThan(0);
      expect(expectCorrupt(makeStateWithRun(baseRun({ modelName: {} }))).length).toBeGreaterThan(0);
    });

    it("strips legacy request from restored runs", () => {
      const coerced = expectOk(makeStateWithRun(baseRun({ request: { messages: [{ role: "user", content: "hi" }] } })));
      expect(coerced.runs["r1"]).not.toHaveProperty("request");
    });
  });

  // WHY: `TemplateFields` is an *array* of field objects
  // (`Template["content"]["fields"]`), not a record. A prior Zod port used
  // `z.record(...)` here, which rejects arrays — so any cards-mode run that
  // persisted its non-null `templateFields` failed the whole row on restore
  // and the conversation fell back to a fresh empty state (empty feed after
  // reload, while chat-only rows survived because they store `null`). These
  // pin the array-or-null acceptance that the pre-refactor hand-rolled gate
  // provided.
  describe("run templateFields coercion", () => {
    function makeStateWithRun(run: Record<string, unknown>) {
      return {
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        messages: [],
        runs: { r1: run },
      };
    }

    function baseRun(overrides: Record<string, unknown> = {}) {
      return {
        id: "r1",
        mode: "cards",
        status: "success",
        cards: [{ content: { "1": { text: "A" } } }],
        cardStatuses: { 0: "success" },
        templateFields: null,
        startedAt: new Date(1),
        elapsedSeconds: 1,
        ...overrides,
      };
    }

    it("accepts a TemplateFields array (cards-mode run survives restore)", () => {
      const fields = [{ id: 1, title: "Front", type: "text", isRequired: true }];
      const coerced = expectOk(makeStateWithRun(baseRun({ templateFields: fields })));
      expect(coerced.runs["r1"].templateFields).toEqual(fields);
    });

    it("accepts null templateFields (chat-mode runs store null)", () => {
      const coerced = expectOk(makeStateWithRun(baseRun({ templateFields: null })));
      expect(coerced.runs["r1"].templateFields).toBeNull();
    });

    it("rejects a record-shaped templateFields as corrupt (not a TemplateFields array)", () => {
      expect(
        expectCorrupt(makeStateWithRun(baseRun({ templateFields: { "1": { text: "A" } } }))).length,
      ).toBeGreaterThan(0);
    });

    it("rejects a missing templateFields as corrupt (a bad field fails the whole row)", () => {
      const { templateFields: _omit, ...withoutTemplateFields } = baseRun();
      expect(expectCorrupt(makeStateWithRun(withoutTemplateFields)).length).toBeGreaterThan(0);
    });
  });

  describe("run dataAccess coercion", () => {
    function makeStateWithRun(run: Record<string, unknown>) {
      return {
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        messages: [],
        runs: { r1: run },
      };
    }

    function baseRun(overrides: Record<string, unknown> = {}) {
      return {
        id: "r1",
        mode: "cards",
        status: "success",
        cards: [],
        cardStatuses: {},
        templateFields: null,
        startedAt: new Date(1),
        elapsedSeconds: 1,
        ...overrides,
      };
    }

    const fullSnapshot: DataAccessSnapshot = {
      context: "User decks:\n- Deck: Spanish — 12 cards — Template: Basic (Front, Back)",
      manifest: {
        decks: [
          { deckId: 3, title: "Spanish", cardCount: 12, templateTitle: "Basic" },
          { deckId: 7, title: "Kanji", cardCount: 40, templateTitle: null },
        ],
        writeTarget: {
          isMissing: false,
          deckId: 3,
          title: "Spanish",
          totalCards: 12,
          listedCards: 10,
          fullFieldCards: 4,
          isCapped: false,
          isTruncated: true,
        },
      },
    };

    it("keeps dataAccess intact across a save→restore roundtrip (JSON wire shape)", () => {
      const state: ConversationReducerState = {
        ...initialConversationState,
        id: "conv-1",
        runs: {
          r1: {
            id: "r1",
            mode: "cards",
            status: "success",
            cards: [],
            cardStatuses: {},
            templateFields: null,
            startedAt: new Date(1000),
            elapsedSeconds: 1,
            dataAccess: fullSnapshot,
          },
        },
      };
      // WHY: JSON round-trip simulates the wire — Dates leave as ISO strings,
      // so asserting a restored Date instance proves the row was coerced, not
      // passed through.
      const persisted = JSON.parse(JSON.stringify(toPersistedState(state))) as unknown;
      const restored = expectOk(persisted);
      expect(restored.runs["r1"]?.startedAt).toBeInstanceOf(Date);
      expect(restored.runs["r1"]?.startedAt.getTime()).toBe(1000);
      expect(restored.runs["r1"]?.dataAccess).toEqual(fullSnapshot);
    });

    it("restores rows saved before data access unchanged (no dataAccess snapshot)", () => {
      const coerced = expectOk(makeStateWithRun(baseRun()));
      expect(coerced.runs["r1"].dataAccess).toBeUndefined();
    });

    it("rejects a wrong-typed dataAccess value as corrupt", () => {
      expect(expectCorrupt(makeStateWithRun(baseRun({ dataAccess: "yes" }))).length).toBeGreaterThan(0);
      expect(expectCorrupt(makeStateWithRun(baseRun({ dataAccess: null }))).length).toBeGreaterThan(0);
      expect(
        expectCorrupt(
          makeStateWithRun(baseRun({ dataAccess: { context: 5, manifest: { decks: [], writeTarget: null } } })),
        ).length,
      ).toBeGreaterThan(0);
      expect(
        expectCorrupt(
          makeStateWithRun(
            baseRun({
              dataAccess: {
                ...fullSnapshot,
                manifest: {
                  ...fullSnapshot.manifest,
                  decks: [{ deckId: 3, title: "Spanish", cardCount: "12", templateTitle: "Basic" }],
                },
              },
            }),
          ),
        ).length,
      ).toBeGreaterThan(0);
      expect(
        expectCorrupt(
          makeStateWithRun(
            baseRun({
              dataAccess: {
                ...fullSnapshot,
                manifest: {
                  ...fullSnapshot.manifest,
                  decks: [{ deckId: 3, title: "Spanish", cardCount: 12, templateTitle: 7 }],
                },
              },
            }),
          ),
        ).length,
      ).toBeGreaterThan(0);
      expect(
        expectCorrupt(
          makeStateWithRun(
            baseRun({
              dataAccess: {
                ...fullSnapshot,
                manifest: {
                  ...fullSnapshot.manifest,
                  writeTarget: { ...(fullSnapshot.manifest.writeTarget as object), isCapped: "no" },
                },
              },
            }),
          ),
        ).length,
      ).toBeGreaterThan(0);
    });

    it("rejects a manifest with a missing required field as corrupt", () => {
      expect(expectCorrupt(makeStateWithRun(baseRun({ dataAccess: { context: "x" } }))).length).toBeGreaterThan(0);
      expect(
        expectCorrupt(
          makeStateWithRun(
            baseRun({
              dataAccess: {
                context: "x",
                manifest: { decks: [{ deckId: 3, title: "Spanish", cardCount: 12 }], writeTarget: null },
              },
            }),
          ),
        ).length,
      ).toBeGreaterThan(0);
      expect(
        expectCorrupt(
          makeStateWithRun(
            baseRun({
              dataAccess: {
                context: "x",
                manifest: {
                  decks: [],
                  writeTarget: {
                    isMissing: false,
                    deckId: 3,
                    title: "Spanish",
                    listedCards: 10,
                    fullFieldCards: 4,
                    isCapped: false,
                    isTruncated: true,
                  },
                },
              },
            }),
          ),
        ).length,
      ).toBeGreaterThan(0);
    });

    it("rejects a writeTarget whose isMissing flag does not match its record as corrupt", () => {
      expect(
        expectCorrupt(
          makeStateWithRun(
            baseRun({ dataAccess: { context: "x", manifest: { decks: [], writeTarget: { isMissing: false } } } }),
          ),
        ).length,
      ).toBeGreaterThan(0);
      expect(
        expectCorrupt(
          makeStateWithRun(
            baseRun({ dataAccess: { context: "x", manifest: { decks: [], writeTarget: { isMissing: "true" } } } }),
          ),
        ).length,
      ).toBeGreaterThan(0);
    });

    it("accepts legal edge shapes: empty context, empty decks, null writeTarget, missing-deck marker", () => {
      const coerced = expectOk(
        makeStateWithRun(
          baseRun({ mode: "chat", dataAccess: { context: "", manifest: { decks: [], writeTarget: null } } }),
        ),
      );
      expect(coerced.runs["r1"]?.dataAccess).toEqual({ context: "", manifest: { decks: [], writeTarget: null } });

      const marker = expectOk(
        makeStateWithRun(
          baseRun({ dataAccess: { context: "", manifest: { decks: [], writeTarget: { isMissing: true } } } }),
        ),
      );
      expect(marker.runs["r1"]?.dataAccess?.manifest.writeTarget).toEqual({ isMissing: true });
    });

    it("strips unknown extra keys inside the manifest instead of failing the row", () => {
      const coerced = expectOk(
        makeStateWithRun(
          baseRun({
            dataAccess: {
              context: "x",
              manifest: { decks: [], writeTarget: null, futureField: 1 },
            },
          }),
        ),
      );
      expect(coerced.runs["r1"]?.dataAccess?.manifest).toEqual({ decks: [], writeTarget: null });
    });
  });

  describe("run toolCalls coercion", () => {
    function makeStateWithRun(run: Record<string, unknown>) {
      return {
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        messages: [],
        runs: { r1: run },
      };
    }

    function baseRun(overrides: Record<string, unknown> = {}) {
      return {
        id: "r1",
        mode: "chat",
        status: "success",
        cards: [],
        cardStatuses: {},
        templateFields: null,
        startedAt: new Date(1),
        elapsedSeconds: 1,
        ...overrides,
      };
    }

    const fullToolCalls = [
      {
        id: "call-1",
        name: "list_decks",
        input: {},
        status: "success" as const,
        output: { decks: [{ deckId: 3, title: "Spanish", cardCount: 12 }] },
      },
      {
        id: "call-2",
        name: "get_deck_cards",
        input: { deckId: 3 },
        status: "error" as const,
        error: { message: "deck missing" },
      },
    ];

    it("keeps toolCalls intact across a save→restore roundtrip (JSON wire shape)", () => {
      const state: ConversationReducerState = {
        ...initialConversationState,
        id: "conv-1",
        runs: {
          r1: {
            id: "r1",
            mode: "chat",
            status: "success",
            cards: [],
            cardStatuses: {},
            templateFields: null,
            startedAt: new Date(1000),
            elapsedSeconds: 1,
            toolCalls: fullToolCalls,
          },
        },
      };
      const persisted = JSON.parse(JSON.stringify(toPersistedState(state))) as unknown;
      const restored = expectOk(persisted);
      expect(restored.runs["r1"]?.startedAt).toBeInstanceOf(Date);
      expect(restored.runs["r1"]?.toolCalls).toEqual(fullToolCalls);
    });

    it("restores rows saved before tool activity unchanged (no toolCalls field)", () => {
      const coerced = expectOk(makeStateWithRun(baseRun()));
      expect(coerced.runs["r1"].toolCalls).toBeUndefined();
    });

    it("rejects a malformed toolCalls value as corrupt", () => {
      expect(expectCorrupt(makeStateWithRun(baseRun({ toolCalls: "yes" }))).length).toBeGreaterThan(0);
      expect(expectCorrupt(makeStateWithRun(baseRun({ toolCalls: null }))).length).toBeGreaterThan(0);
      expect(
        expectCorrupt(
          makeStateWithRun(
            baseRun({
              toolCalls: [{ id: "call-1", name: "list_decks", input: {}, status: "pending" }],
            }),
          ),
        ).length,
      ).toBeGreaterThan(0);
      expect(
        expectCorrupt(makeStateWithRun(baseRun({ toolCalls: [{ name: "list_decks", input: {}, status: "success" }] })))
          .length,
      ).toBeGreaterThan(0);
      expect(
        expectCorrupt(
          makeStateWithRun(baseRun({ toolCalls: [{ id: 1, name: "list_decks", input: {}, status: "success" }] })),
        ).length,
      ).toBeGreaterThan(0);
    });

    it("strips unknown extra keys on a tool call instead of failing the row", () => {
      const coerced = expectOk(
        makeStateWithRun(
          baseRun({
            toolCalls: [{ id: "call-1", name: "list_decks", input: {}, status: "running", extra: true }],
          }),
        ),
      );
      expect(coerced.runs["r1"]?.toolCalls).toEqual([
        { id: "call-1", name: "list_decks", input: {}, status: "running" },
      ]);
    });
  });

  // WHY: persisted rows are a compat boundary.
  // These pin the three behaviors a naive Zod port loses: `revertState` is
  // ignored even when present, an unparseable *present* `updatedAt` fails the
  // row, and `dismissedRunErrorId` (which had no pre-refactor validation gate)
  // is tolerated untyped rather than rejected.
  describe("compatibility boundary", () => {
    it("ignores a persisted revertState and rebuilds it as null", () => {
      const coerced = expectOk({
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        revertState: { revertedToUserMessageId: "u-r1", preRevertInputText: "hi" },
      });
      expect(coerced.revertState).toBeNull();
    });

    it("fails the row as corrupt when updatedAt is present but unparseable (not coerced to null)", () => {
      expect(
        expectCorrupt({
          ...initialConversationState,
          id: "conv-1",
          createdAt: new Date(1),
          updatedAt: "not-a-date",
        }).length,
      ).toBeGreaterThan(0);
    });

    it("tolerates an untyped dismissedRunErrorId (no validation gate, pre-refactor behavior)", () => {
      const coerced = expectOk({
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        dismissedRunErrorId: 7,
      });
      // `?? null` defaulting: a present non-null value is kept as-is.
      expect(coerced.dismissedRunErrorId).toBe(7);
    });
  });

  describe("schemaVersion and strict lifecycle validation", () => {
    function makeStateWithRun(run: Record<string, unknown>) {
      return {
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        messages: [],
        runs: { r1: run },
      };
    }

    function baseRun(overrides: Record<string, unknown> = {}) {
      return {
        id: "r1",
        mode: "chat",
        status: "success",
        cards: [],
        cardStatuses: {},
        templateFields: null,
        startedAt: new Date(1),
        elapsedSeconds: 1,
        ...overrides,
      };
    }

    it("migrates legacy rows missing schemaVersion to the current version", () => {
      const coerced = expectOk({
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
      });
      expect(toPersistedState(coerced).schemaVersion).toBe(CONVERSATION_SCHEMA_VERSION);
    });

    it("migrates a row declaring schemaVersion 0 forward to the current version", () => {
      const coerced = expectOk({
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        schemaVersion: 0,
      });
      expect(toPersistedState(coerced).schemaVersion).toBe(CONVERSATION_SCHEMA_VERSION);
    });

    it("classifies a future schemaVersion row as unsupportedVersion with found and supported", () => {
      expect(
        coerceConversationState({
          ...initialConversationState,
          id: "conv-1",
          createdAt: new Date(1),
          schemaVersion: CONVERSATION_SCHEMA_VERSION + 1,
        }),
      ).toEqual({
        status: "unsupportedVersion",
        found: CONVERSATION_SCHEMA_VERSION + 1,
        supported: CONVERSATION_SCHEMA_VERSION,
      });
    });

    it("classifies a row whose schemaVersion cannot be determined as corrupt", () => {
      expect(
        expectCorrupt({
          ...initialConversationState,
          id: "conv-1",
          createdAt: new Date(1),
          schemaVersion: "2",
        }).length,
      ).toBeGreaterThan(0);
      expect(
        expectCorrupt({
          ...initialConversationState,
          id: "conv-1",
          createdAt: new Date(1),
          schemaVersion: 1.5,
        }).length,
      ).toBeGreaterThan(0);
      expect(
        expectCorrupt({
          ...initialConversationState,
          id: "conv-1",
          createdAt: new Date(1),
          schemaVersion: -1,
        }).length,
      ).toBeGreaterThan(0);
    });

    it("rejects an unknown run status string as corrupt", () => {
      expect(expectCorrupt(makeStateWithRun(baseRun({ status: "pending" }))).length).toBeGreaterThan(0);
    });

    it("rejects canceled without reason user after migration heal is skipped by explicit bad reason", () => {
      expect(
        expectCorrupt(makeStateWithRun(baseRun({ status: "canceled", reason: "app_shutdown" }))).length,
      ).toBeGreaterThan(0);
    });

    it("accepts canceled with reason user", () => {
      const coerced = expectOk(makeStateWithRun(baseRun({ status: "canceled", reason: "user" })));
      expect(coerced.runs["r1"]?.status).toBe("canceled");
      expect(coerced.runs["r1"]?.reason).toBe("user");
    });

    it("accepts interrupted with crash_recovery", () => {
      const coerced = expectOk(makeStateWithRun(baseRun({ status: "interrupted", reason: "crash_recovery" })));
      expect(coerced.runs["r1"]?.status).toBe("interrupted");
      expect(coerced.runs["r1"]?.reason).toBe("crash_recovery");
    });

    it("rejects success carrying a termination reason on a current-schema row as corrupt", () => {
      expect(
        expectCorrupt({
          ...makeStateWithRun(baseRun({ status: "success", reason: "user" })),
          schemaVersion: CONVERSATION_SCHEMA_VERSION,
        }).length,
      ).toBeGreaterThan(0);
    });

    it("strips a legacy success termination reason during v0→v1 migration", () => {
      const coerced = expectOk(makeStateWithRun(baseRun({ status: "success", reason: "user" })));
      expect(coerced.runs["r1"]?.status).toBe("success");
      expect(coerced.runs["r1"]?.reason).toBeUndefined();
    });

    it("heals legacy canceled without reason during v0→v1 migration", () => {
      const coerced = expectOk(makeStateWithRun(baseRun({ status: "canceled" })));
      expect(coerced.runs["r1"]?.status).toBe("canceled");
      expect(coerced.runs["r1"]?.reason).toBe("user");
    });
  });

  describe("run cardStatuses coercion", () => {
    function makeStateWithRun(run: Record<string, unknown>) {
      return {
        ...initialConversationState,
        id: "conv-1",
        createdAt: new Date(1),
        messages: [],
        runs: { r1: run },
      };
    }

    function baseRun(overrides: Record<string, unknown> = {}) {
      return {
        id: "r1",
        mode: "cards",
        status: "success",
        cards: [{ content: { "1": { text: "A" } } }],
        cardStatuses: { 0: "success" },
        templateFields: null,
        startedAt: new Date(1),
        elapsedSeconds: 1,
        ...overrides,
      };
    }

    it("accepts all valid CardStatus values", () => {
      const coerced = expectOk(
        makeStateWithRun(
          baseRun({
            cardStatuses: { 0: "idle", 1: "pending", 2: "success", 3: "error" },
          }),
        ),
      );
      expect(coerced.runs["r1"].cardStatuses).toEqual({
        0: "idle",
        1: "pending",
        2: "success",
        3: "error",
      });
    });

    it("rejects an unknown card status string as corrupt", () => {
      expect(expectCorrupt(makeStateWithRun(baseRun({ cardStatuses: { 0: "generating" } }))).length).toBeGreaterThan(0);
    });

    it("rejects non-string card status values as corrupt", () => {
      expect(expectCorrupt(makeStateWithRun(baseRun({ cardStatuses: { 0: 1 } }))).length).toBeGreaterThan(0);
      expect(expectCorrupt(makeStateWithRun(baseRun({ cardStatuses: { 0: {} } }))).length).toBeGreaterThan(0);
      expect(expectCorrupt(makeStateWithRun(baseRun({ cardStatuses: { 0: true } }))).length).toBeGreaterThan(0);
    });
  });
});

describe("normalizeRestoredConversation", () => {
  it("converts streaming runs to interrupted with crash_recovery and keeps messages", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: "r1",
      messages: [
        {
          id: "user-r1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
          metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
        },
        {
          id: "assistant-r1",
          role: "assistant",
          parts: [{ type: "text", text: "partial reply" }],
          metadata: { kind: "chat-text", runId: "r1" },
        },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "streaming",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(5000),
          elapsedSeconds: null,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs["r1"]?.status).toBe("interrupted");
    expect(next.runs["r1"]?.reason).toBe("crash_recovery");
    expect(next.runs["r1"]?.elapsedSeconds).toEqual(expect.any(Number));
    expect(next.messages).toHaveLength(2);
    expect(next.messages[1]?.parts).toEqual([{ type: "text", text: "partial reply" }]);
    expect(next.activeRunId).toBeNull();
    expect(next.dismissedRunErrorId).toBeNull();
  });

  it("marks in-flight toolCalls as error when converting a streaming run", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: "r1",
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "streaming",
          cards: [],
          cardStatuses: {},
          toolCalls: [
            { id: "call-1", name: "list_decks", input: {}, status: "success", output: { decks: [] } },
            { id: "call-2", name: "get_deck_cards", input: { deckId: 3 }, status: "running" },
          ],
          templateFields: null,
          startedAt: new Date(5000),
          elapsedSeconds: null,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;
    expect(next.runs["r1"]?.toolCalls).toEqual([
      { id: "call-1", name: "list_decks", input: {}, status: "success", output: { decks: [] } },
      { id: "call-2", name: "get_deck_cards", input: { deckId: 3 }, status: "error" },
    ]);
  });

  it("preserves failed runs and assistant message parts, clearing dismissedRunErrorId", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      dismissedRunErrorId: "r1",
      messages: [
        {
          id: "user-r1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
          metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
        },
        {
          id: "assistant-r1",
          role: "assistant",
          parts: [{ type: "text", text: "partial reply before fail" }],
          metadata: { kind: "chat-text", runId: "r1" },
        },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "failed",
          error: { message: "Network error" },
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 2,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs["r1"]).toEqual(state.runs["r1"]);
    expect(next.messages[1]?.parts).toEqual([{ type: "text", text: "partial reply before fail" }]);
    expect(next.messages[1]?.metadata).toEqual({ kind: "chat-text", runId: "r1" });
    expect(next.dismissedRunErrorId).toBeNull();
  });

  it("preserves failed card runs and generated-cards message metadata without rewriting", () => {
    const cards = [{ content: { "1": { text: "A" } } }];
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      dismissedRunErrorId: "r1",
      messages: [
        {
          id: "user-r1",
          role: "user",
          parts: [{ type: "text", text: "Make cards" }],
          metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
        },
        {
          id: "assistant-r1",
          role: "assistant",
          parts: [{ type: "text", text: "" }],
          metadata: { kind: "generated-cards", runId: "r1" },
        },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "cards",
          status: "failed",
          error: { message: "Provider error" },
          cards,
          cardStatuses: { 0: "idle" },
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 1,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs["r1"]).toEqual(state.runs["r1"]);
    expect(next.runs["r1"]?.cards).toEqual(cards);
    expect(next.messages[1]?.metadata).toEqual({ kind: "generated-cards", runId: "r1" });
    expect(next.dismissedRunErrorId).toBeNull();
  });

  it("returns null when a failed run needs no other restore normalization", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      dismissedRunErrorId: null,
      messages: [
        {
          id: "assistant-r1",
          role: "assistant",
          parts: [{ type: "text", text: "kept partial" }],
          metadata: { kind: "chat-text", runId: "r1" },
        },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "failed",
          error: { message: "Network error" },
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 2,
        },
      },
    };

    expect(normalizeRestoredConversation(state)).toBeNull();
  });

  it("leaves successful runs unchanged and preserves their messages", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      dismissedRunErrorId: null,
      messages: [
        {
          id: "user-r1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
          metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
        },
        {
          id: "assistant-r1",
          role: "assistant",
          parts: [{ type: "text", text: "Hi there" }],
          metadata: { kind: "chat-text", runId: "r1" },
        },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 5,
        },
      },
    };

    const next = normalizeRestoredConversation(state);

    expect(next).toBeNull();
  });

  it("backfills runId onto legacy user messages that only encoded it in the id", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      messages: [
        {
          id: "user-r1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
          metadata: { createdAt: "2026-07-01T11:00:00.000Z" },
        },
        {
          id: "assistant-r1",
          role: "assistant",
          parts: [{ type: "text", text: "Hi" }],
          metadata: { kind: "chat-text", runId: "r1" },
        },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 1,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.messages[0].metadata).toEqual({
      createdAt: "2026-07-01T11:00:00.000Z",
      runId: "r1",
    });
    expect(next.runs["r1"].status).toBe("success");
  });

  it("normalizes Date createdAt and heals epoch timestamps from run.startedAt", () => {
    const startedAt = new Date("2026-07-18T11:00:00.000Z");
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      messages: [
        {
          id: "user-r1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
          // WHY: Electron fromWire used to revive ISO strings into Dates here.
          metadata: { createdAt: new Date("2026-07-18T11:00:00.000Z"), runId: "r1" },
        },
        {
          id: "user-r2",
          role: "user",
          parts: [{ type: "text", text: "Again" }],
          // WHY: Prior buggy restore wrote epoch; heal from the paired run.
          metadata: { createdAt: "1970-01-01T00:00:00.000Z", runId: "r2" },
        },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt,
          elapsedSeconds: 1,
        },
        r2: {
          id: "r2",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt,
          elapsedSeconds: 1,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.messages[0].metadata).toEqual({
      createdAt: "2026-07-18T11:00:00.000Z",
      runId: "r1",
    });
    expect(next.messages[1].metadata).toEqual({
      createdAt: "2026-07-18T11:00:00.000Z",
      runId: "r2",
    });
  });

  it("resets pending card statuses to idle while preserving success and error", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      runs: {
        r1: {
          id: "r1",
          mode: "cards",
          status: "success",
          cards: [
            { content: { "1": { text: "A" } } },
            { content: { "1": { text: "B" } } },
            { content: { "1": { text: "C" } } },
            { content: { "1": { text: "D" } } },
          ],
          cardStatuses: { 0: "pending", 1: "success", 2: "error", 3: "idle" },
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 5,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs["r1"].cardStatuses).toEqual({
      0: "idle",
      1: "success",
      2: "error",
      3: "idle",
    });
    expect(next.runs["r1"].status).toBe("success");
  });

  it("keeps both successful and failed runs and preserves failed assistant parts", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      dismissedRunErrorId: "r2",
      messages: [
        {
          id: "user-r1",
          role: "user",
          parts: [{ type: "text", text: "First" }],
          metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
        },
        {
          id: "assistant-r1",
          role: "assistant",
          parts: [{ type: "text", text: "Response 1" }],
          metadata: { kind: "chat-text", runId: "r1" },
        },
        {
          id: "user-r2",
          role: "user",
          parts: [{ type: "text", text: "Second" }],
          metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r2" },
        },
        {
          id: "assistant-r2",
          role: "assistant",
          parts: [{ type: "text", text: "partial before fail" }],
          metadata: { kind: "chat-text", runId: "r2" },
        },
      ],
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 3,
        },
        r2: {
          id: "r2",
          mode: "chat",
          status: "failed",
          error: { message: "Network error" },
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(2000),
          elapsedSeconds: 1,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs).toEqual(state.runs);
    expect(next.messages[3]?.parts).toEqual([{ type: "text", text: "partial before fail" }]);
    expect(next.messages[3]?.metadata).toEqual({ kind: "chat-text", runId: "r2" });
    expect(next.activeRunId).toBeNull();
    expect(next.dismissedRunErrorId).toBeNull();
  });

  it("clears dismissedRunErrorId while keeping the failed run", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      dismissedRunErrorId: "r1",
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "failed",
          error: { message: "Timeout" },
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 5,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs["r1"]).toEqual(state.runs["r1"]);
    expect(next.dismissedRunErrorId).toBeNull();
  });

  it("preserves lastReadRunId when a streaming run is normalized to interrupted", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      lastReadRunId: "r1",
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "streaming",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: null,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs["r1"]?.status).toBe("interrupted");
    expect(next.runs["r1"]?.reason).toBe("crash_recovery");
    expect(next.lastReadRunId).toBe("r1");
  });

  it("preserves lastReadRunId when the run it points to is failed", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      lastReadRunId: "r1",
      dismissedRunErrorId: "r1",
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "failed",
          error: { message: "Network error" },
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 1,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs["r1"]).toEqual(state.runs["r1"]);
    expect(next.lastReadRunId).toBe("r1");
  });

  it("preserves lastReadRunId when the run it points to survives normalization", () => {
    // WHY: Force normalization via pending card statuses so the
    // function returns a non-null state. The lastReadRunId should
    // survive the round-trip because the run it points to is kept.
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      activeRunId: null,
      lastReadRunId: "r1",
      runs: {
        r1: {
          id: "r1",
          mode: "cards",
          status: "success",
          cards: [{ content: { "1": { text: "A" } } }, { content: { "1": { text: "B" } } }],
          cardStatuses: { 0: "pending", 1: "success" },
          templateFields: null,
          startedAt: new Date(1000),
          elapsedSeconds: 1,
        },
      },
    };

    const next = normalizeRestoredConversation(state)!;

    expect(next.runs["r1"].status).toBe("success");
    expect(next.runs["r1"].cardStatuses).toEqual({ 0: "idle", 1: "success" });
    expect(next.lastReadRunId).toBe("r1");
  });
});

describe("findLatestErroredRun", () => {
  it("returns the latest failed run that is not dismissed", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      dismissedRunErrorId: "r1",
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "failed",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1),
          elapsedSeconds: 1,
          error: { message: "old" },
        },
        r2: {
          id: "r2",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(2),
          elapsedSeconds: 1,
        },
        r3: {
          id: "r3",
          mode: "cards",
          status: "failed",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(3),
          elapsedSeconds: 1,
          error: { message: "latest" },
        },
      },
    };

    expect(findLatestErroredRun(state)?.id).toBe("r3");
  });

  it("returns null when the only failed run is dismissed", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      dismissedRunErrorId: "r1",
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "failed",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1),
          elapsedSeconds: 1,
          error: { message: "gone" },
        },
      },
    };

    expect(findLatestErroredRun(state)).toBeNull();
  });

  it("returns null when there are no failed runs", () => {
    const state: ConversationReducerState = {
      ...initialConversationState,
      id: "conv-1",
      runs: {
        r1: {
          id: "r1",
          mode: "chat",
          status: "success",
          cards: [],
          cardStatuses: {},
          templateFields: null,
          startedAt: new Date(1),
          elapsedSeconds: 1,
        },
      },
    };

    expect(findLatestErroredRun(state)).toBeNull();
  });
});
