import type { AssistantEvent } from "@koloda/assistant";
import { describe, expect, it } from "vitest";
import { assistantEventToReducerAction } from "./assistant-event-to-action";

describe("assistantEventToReducerAction", () => {
  it("maps runStarted to restartRun", () => {
    const event: AssistantEvent = {
      type: "runStarted",
      conversationId: "c1",
      run: { runId: "r1", templateFields: null, modelName: "m" },
    };
    expect(assistantEventToReducerAction(event)).toEqual([
      "restartRun",
      { runId: "r1", templateFields: null, modelName: "m" },
    ]);
  });

  it("maps runStarted dataAccess through to restartRun, keeping identity", () => {
    const dataAccess = { context: "User decks:", manifest: { decks: [], writeTarget: null } };
    const event: AssistantEvent = {
      type: "runStarted",
      conversationId: "c1",
      run: { runId: "r1", templateFields: null, modelName: "m", dataAccess },
    };
    const action = assistantEventToReducerAction(event);
    expect(action[0]).toBe("restartRun");
    // WHY: identity — the replayed snapshot must reach the run record unchanged.
    expect(action[1].dataAccess).toBe(dataAccess);
  });

  it("maps text/card/usage chunks", () => {
    expect(
      assistantEventToReducerAction({
        type: "runChunk",
        conversationId: "c1",
        runId: "r1",
        chunk: { kind: "assistantText", text: "hi" },
      }),
    ).toEqual(["updateAssistantText", { runId: "r1", text: "hi" }]);

    const card = { content: { front: { text: "a" } } };
    expect(
      assistantEventToReducerAction({
        type: "runChunk",
        conversationId: "c1",
        runId: "r1",
        chunk: { kind: "card", card },
      }),
    ).toEqual(["addCard", { runId: "r1", card }]);

    const usage = { promptTokens: 1, completionTokens: 2, totalTokens: 3 };
    expect(
      assistantEventToReducerAction({
        type: "runChunk",
        conversationId: "c1",
        runId: "r1",
        chunk: { kind: "usage", usage },
      }),
    ).toEqual(["setUsage", { runId: "r1", usage }]);
  });

  it("maps toolCall/toolResult chunks to tool actions", () => {
    const call = { id: "call-1", name: "list_decks", input: {} };
    expect(
      assistantEventToReducerAction({
        type: "runChunk",
        conversationId: "c1",
        runId: "r1",
        chunk: { kind: "toolCall", call },
      }),
    ).toEqual(["addToolCall", { runId: "r1", call }]);

    expect(
      assistantEventToReducerAction({
        type: "runChunk",
        conversationId: "c1",
        runId: "r1",
        chunk: { kind: "toolResult", callId: "call-1", output: { decks: [] } },
      }),
    ).toEqual(["setToolCallResult", { runId: "r1", callId: "call-1", output: { decks: [] } }]);

    expect(
      assistantEventToReducerAction({
        type: "runChunk",
        conversationId: "c1",
        runId: "r1",
        chunk: { kind: "toolResult", callId: "call-1", error: "boom" },
      }),
    ).toEqual(["setToolCallResult", { runId: "r1", callId: "call-1", error: "boom" }]);
  });

  it("maps runTerminated outcomes", () => {
    expect(
      assistantEventToReducerAction({
        type: "runTerminated",
        conversationId: "c1",
        runId: "r1",
        outcome: { status: "success" },
      }),
    ).toEqual(["completeRun", { runId: "r1" }]);

    expect(
      assistantEventToReducerAction({
        type: "runTerminated",
        conversationId: "c1",
        runId: "r1",
        outcome: { status: "failed", error: { message: "boom" } },
      }),
    ).toEqual(["runFailed", { runId: "r1", error: { message: "boom" } }]);

    expect(
      assistantEventToReducerAction({
        type: "runTerminated",
        conversationId: "c1",
        runId: "r1",
        outcome: { status: "canceled", reason: "user" },
      }),
    ).toEqual(["cancelRun", { runId: "r1" }]);

    expect(
      assistantEventToReducerAction({
        type: "runTerminated",
        conversationId: "c1",
        runId: "r1",
        outcome: { status: "interrupted", reason: "app_shutdown" },
      }),
    ).toEqual(["interruptRun", { runId: "r1", reason: "app_shutdown" }]);
  });
});
