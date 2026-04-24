import { describe, expect, it, vi } from "vitest";
import {
  buildSystemPromptForProvider,
  generateCardsWithLMStudio,
  generateCardsWithOllama,
  getCardContentSchema,
  transformGeneratedCards,
} from "./ai-cards-generation";
import type { Template } from "./templates";
import { DEFAULT_TEMPLATE } from "./templates";
import type { DeepPartial } from "./utility";
import { deepMerge } from "./utility";

function createTemplate(overrides: DeepPartial<Template> = {}): Template {
  const base: Template = {
    id: 1,
    title: "Basic",
    content: structuredClone(DEFAULT_TEMPLATE.content),
    isLocked: false,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: null,
  };

  return deepMerge(base, overrides) as Template;
}

function createRequest(template = createTemplate()) {
  return {
    template,
    input: {
      credentialId: "550e8400-e29b-41d4-a716-446655440000",
      modelId: "openrouter/gpt-5-mini",
      prompt: "Create cards",
      temperature: 0.2,
      deckId: 1,
      templateId: template.id,
    },
    onCard: vi.fn(),
  };
}

describe("ai-cards-generation", () => {
  it("adds provider formatting instructions only for non-openrouter providers", () => {
    const template = createTemplate();

    expect(buildSystemPromptForProvider(template.content.fields, "openrouter")).not.toContain(
      "Provider-specific format instructions:",
    );
    expect(buildSystemPromptForProvider(template.content.fields, "lmstudio")).toContain(
      "Provider-specific format instructions:",
    );
    expect(buildSystemPromptForProvider(template.content.fields, "lmstudio")).toContain("**Front**: <value>");
  });

  it("validates required and optional generated card content", () => {
    const schema = getCardContentSchema([
      { id: 1, title: "Front", type: "text", isRequired: true },
      { id: 2, title: "Back", type: "text", isRequired: false },
    ]);

    expect(schema.parse({
      content: {
        "1": { text: "Question" },
        "2": { text: "" },
      },
    })).toEqual({
      content: {
        "1": { text: "Question" },
        "2": { text: "" },
      },
    });
    expect(() =>
      schema.parse({
        content: {
          "1": { text: "" },
          "2": { text: "" },
        },
      })
    ).toThrow();
  });

  it("parses fenced json card output from Ollama responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            message: {
              content: [
                "```json",
                "[{\"content\":{\"1\":{\"text\":\"Question\"},\"2\":{\"text\":\"Answer\"}}}]",
                "```",
              ].join("\n"),
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        )
      ),
    );
    const request = createRequest();

    await generateCardsWithOllama(request, "http://localhost:11434");

    expect(request.onCard).toHaveBeenCalledTimes(1);
    expect(request.onCard).toHaveBeenCalledWith({
      content: {
        "1": { text: "Question" },
        "2": { text: "Answer" },
      },
    });
  });

  it("parses markdown card output from LM Studio responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: [
                  "## Card 1",
                  "**Front**: First question",
                  "**Back**: First answer",
                  "",
                  "## Card 2",
                  "**Front**: Second question",
                  "**Back**: Second answer",
                ].join("\n"),
              },
            }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        )
      ),
    );
    const request = createRequest();

    await generateCardsWithLMStudio(request, { provider: "lmstudio", baseUrl: "http://localhost:1234" });

    expect(request.onCard).toHaveBeenNthCalledWith(1, {
      content: {
        "1": { text: "First question" },
        "2": { text: "First answer" },
      },
    });
    expect(request.onCard).toHaveBeenNthCalledWith(2, {
      content: {
        "1": { text: "Second question" },
        "2": { text: "Second answer" },
      },
    });
  });

  it("rejects Ollama cards that fail schema validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            message: {
              content: [
                "```json",
                '[{"content":{"1":{"text":""},"2":{"text":"Answer"}}}]',
                "```",
              ].join("\n"),
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        )
      ),
    );
    const request = createRequest();

    await expect(generateCardsWithOllama(request, "http://localhost:11434")).rejects.toMatchObject({
      code: "ai.invalid-response",
    });
    expect(request.onCard).not.toHaveBeenCalled();
  });

  it("rejects LM Studio cards that fail schema validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: [
                  "## Card 1",
                  "**Front**:",
                  "**Back**: Only back",
                ].join("\n"),
              },
            }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        )
      ),
    );
    const request = createRequest();

    await expect(generateCardsWithLMStudio(
      request,
      { provider: "lmstudio", baseUrl: "http://localhost:1234" },
    )).rejects.toMatchObject({
      code: "ai.invalid-response",
    });
    expect(request.onCard).not.toHaveBeenCalled();
  });

  it("returns an app error when LM Studio omits message content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: null,
              },
            }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        )
      ),
    );

    await expect(generateCardsWithLMStudio(
      createRequest(),
      { provider: "lmstudio", baseUrl: "http://localhost:1234" },
    )).rejects.toMatchObject({
      code: "ai.invalid-response",
    });
  });

  it("transforms generated cards into insertable card payloads", () => {
    expect(transformGeneratedCards(
      [{
        content: {
          "1": { text: "Front" },
          "2": { text: "Back" },
        },
      }],
      5,
      7,
    )).toEqual([{
      deckId: 5,
      templateId: 7,
      content: {
        "1": { text: "Front" },
        "2": { text: "Back" },
      },
      state: 0,
      dueAt: null,
      stability: 0,
      difficulty: 0,
      scheduledDays: 0,
      learningSteps: 0,
      reps: 0,
      lapses: 0,
      lastReviewedAt: null,
    }]);
  });
});
