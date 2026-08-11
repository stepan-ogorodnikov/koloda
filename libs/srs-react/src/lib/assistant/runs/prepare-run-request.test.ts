import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { createTemplate } from "../../../test/test-helpers";
import type { AssistantConversationConfig } from "../state/assistant-conversation-config";
import { createTextMessage, userMessageId } from "../state/assistant-messages";
import type { GenerationRun } from "../state/conversation-reducer";
import { prepareRunRequest, toRetryCommand, toSubmitCommand } from "./prepare-run-request";

function makeConfig(overrides: Partial<AssistantConversationConfig> = {}): AssistantConversationConfig {
  return {
    profileId: "prof-1",
    modelId: "model-1",
    modelName: "GPT-x",
    temperature: 0.5,
    reasoningEffort: "",
    deckId: 0,
    templateId: 0,
    template: null,
    cardsPromptTemplate: null,
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
    expect(prepareRunRequest(makeConfig(), "chat", "", [], {})).toBeNull();
  });

  it("returns null when profileId is missing", () => {
    expect(prepareRunRequest(makeConfig({ profileId: "" }), "chat", "hi", [], {})).toBeNull();
  });

  it("returns null when modelId is missing", () => {
    expect(prepareRunRequest(makeConfig({ modelId: "" }), "chat", "hi", [], {})).toBeNull();
  });

  it("returns null for cards mode without a template", () => {
    expect(prepareRunRequest(makeConfig({ template: null }), "cards", "hi", [], {})).toBeNull();
  });

  it("prepares a chat run with execution identity and provider request", () => {
    const messages = [chatUserMessage("run-1", "prior")];
    const runs: Record<string, GenerationRun> = {};
    const prepared = prepareRunRequest(makeConfig(), "chat", "hello", messages, runs);

    expect(prepared).not.toBeNull();
    expect(prepared!.kind).toBe("chat");
    expect(prepared!.modelName).toBe("GPT-x");
    expect(prepared!.templateFields).toBeNull();
    expect(prepared!.execution).toEqual({ profileId: "prof-1" });
    expect(prepared!.request).toMatchObject({
      input: { modelId: "model-1", prompt: "hello" },
    });
  });

  it("prepares a cards run with template snapshot in execution identity", () => {
    const template = createTemplate({
      id: 42,
      content: { fields: [{ id: 1, title: "Front", isRequired: true, type: "text" }] },
    });
    const prepared = prepareRunRequest(
      makeConfig({ template, templateId: 42, deckId: 1 }),
      "cards",
      "make cards",
      [],
      {},
    );

    expect(prepared).not.toBeNull();
    expect(prepared!.kind).toBe("cards");
    expect(prepared!.templateFields).toEqual(template.content.fields);
    expect(prepared!.execution).toEqual({
      profileId: "prof-1",
      template: {
        id: 42,
        content: { fields: template.content.fields },
      },
    });
  });
});

describe("toSubmitCommand / toRetryCommand", () => {
  it("builds a submit command for chat", () => {
    const prepared = prepareRunRequest(makeConfig(), "chat", "hello", [], {});
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

  it("builds a retry command carrying mode and template fields", () => {
    const prepared = prepareRunRequest(makeConfig(), "chat", "hello", [], {});
    expect(prepared).not.toBeNull();
    expect(toRetryCommand("conv-1", "run-1", "chat", prepared!)).toEqual({
      type: "retry",
      conversationId: "conv-1",
      input: {
        runId: "run-1",
        request: prepared!.request,
        templateFields: null,
        mode: "chat",
        modelName: "GPT-x",
        execution: prepared!.execution,
      },
    });
  });
});
