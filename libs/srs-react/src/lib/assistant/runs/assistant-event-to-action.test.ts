import type { AssistantEvent } from "@koloda/assistant";
import { describe, expect, it } from "vitest";
import { assistantEventToReducerAction } from "./assistant-event-to-action";

describe("assistantEventToReducerAction", () => {
  it("maps runStarted to restartRun", () => {
    const event: AssistantEvent = {
      type: "runStarted",
      conversationId: "c1",
      run: { runId: "r1", mode: "chat", templateFields: null, modelName: "m" },
    };
    expect(assistantEventToReducerAction(event)).toEqual([
      "restartRun",
      { runId: "r1", mode: "chat", templateFields: null, modelName: "m" },
    ]);
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
