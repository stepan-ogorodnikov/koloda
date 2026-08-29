import { ASSISTANT_TOOL_SPECS } from "@koloda/ai";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import type { AssistantConversationConfig } from "../state/assistant-conversation-config";
import { createTextMessage, userMessageId } from "../state/assistant-messages";
import type { AssistantRun } from "../state/conversation-reducer";
import { prepareRunRequest, toRetryCommand, toSubmitCommand } from "./prepare-run-request";

const CHAT_TOOLS = Object.keys(ASSISTANT_TOOL_SPECS);

function makeConfig(overrides: Partial<AssistantConversationConfig> = {}): AssistantConversationConfig {
  return {
    profileId: "prof-1",
    modelId: "model-1",
    modelName: "GPT-x",
    temperature: 0.5,
    reasoningEffort: "",
    chatPromptTemplate: null,
    _: ((m: unknown) => m) as never,
    ...overrides,
  };
}

function chatUserMessage(runId: string, text: string): UIMessage {
  return createTextMessage(userMessageId(runId), "user", text, {
    createdAt: "2026-01-01T00:00:00.000Z",
    runId,
  });
}

describe("prepareRunRequest", () => {
  it("returns null when prompt is empty", () => {
    expect(prepareRunRequest(makeConfig(), "", [], {})).toBeNull();
  });

  it("returns null when profileId is missing", () => {
    expect(prepareRunRequest(makeConfig({ profileId: "" }), "hi", [], {})).toBeNull();
  });

  it("returns null when modelId is missing", () => {
    expect(prepareRunRequest(makeConfig({ modelId: "" }), "hi", [], {})).toBeNull();
  });

  it("prepares a chat run with execution identity and provider request", () => {
    const messages = [chatUserMessage("run-1", "prior")];
    const runs: Record<string, AssistantRun> = {};
    const prepared = prepareRunRequest(makeConfig(), "hello", messages, runs);

    expect(prepared).not.toBeNull();
    expect(prepared!.kind).toBe("chat");
    expect(prepared!.modelName).toBe("GPT-x");
    expect(prepared!.templateFields).toBeNull();
    expect(prepared!.execution).toEqual({ profileId: "prof-1" });
    expect(prepared!.request).toMatchObject({
      input: { modelId: "model-1" },
      tools: CHAT_TOOLS,
    });
    expect(prepared!.request).not.toHaveProperty("dataContext");
  });
});

describe("prepareRunRequest — data access", () => {
  it("chat requests carry tool names and do not embed a snapshot", () => {
    const prepared = prepareRunRequest(makeConfig(), "hello", [], {});

    expect(prepared).not.toBeNull();
    expect(prepared!.request.tools).toEqual(CHAT_TOOLS);
    expect(prepared!.request.tools).toEqual(["list_decks", "get_deck_cards", "propose_cards"]);
    expect(prepared!.request).not.toHaveProperty("dataContext");
  });
});

describe("toSubmitCommand / toRetryCommand", () => {
  it("builds a submit command for chat", () => {
    const prepared = prepareRunRequest(makeConfig(), "hello", [], {});
    expect(prepared).not.toBeNull();
    expect(toSubmitCommand("conv-1", "run-1", prepared!)).toEqual({
      type: "submit",
      conversationId: "conv-1",
      input: {
        kind: "chat",
        runId: "run-1",
        request: prepared!.request,
        execution: prepared!.execution,
      },
    });
  });

  it("builds a retry command carrying template fields", () => {
    const prepared = prepareRunRequest(makeConfig(), "hello", [], {});
    expect(prepared).not.toBeNull();
    expect(toRetryCommand("conv-1", "run-1", prepared!)).toEqual({
      type: "retry",
      conversationId: "conv-1",
      input: {
        runId: "run-1",
        request: prepared!.request,
        templateFields: null,
        modelName: "GPT-x",
        execution: prepared!.execution,
      },
    });
  });

  it("builds a retry command without embedding data access", () => {
    const prepared = prepareRunRequest(makeConfig(), "hello", [], {});
    expect(prepared).not.toBeNull();
    const command = toRetryCommand("conv-1", "run-1", prepared!);

    expect(command.input).not.toHaveProperty("dataAccess");
  });
});
