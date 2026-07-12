import { describe, expect, it, vi } from "vitest";
import {
  generateCardsWithLMStudio,
  generateCardsWithOllama,
  generateCardsWithOpencodeGo,
  generateCardsWithOpencodeZen,
} from "./card-generation";
import { getCardContentSchema } from "./card-parsing";
import type { CardGenerationFields } from "./generation";
import { buildSystemPromptForProvider } from "./prompts";
import { OPENCODE_GO_BASE_URL, OPENCODE_ZEN_BASE_URL } from "./provider-catalog";

function createFields(): CardGenerationFields {
  return [
    { id: 1, title: "Front", type: "text", isRequired: true },
    { id: 2, title: "Back", type: "text", isRequired: false },
  ];
}

function createRequest(fields = createFields()) {
  return {
    template: { content: { fields } },
    input: {
      modelId: "openrouter/gpt-5-mini",
      prompt: "Create cards",
      temperature: 0.2,
      deckId: 1,
      templateId: 1,
    },
    onCard: vi.fn(),
  };
}

describe("card-generation", () => {
  it("adds provider formatting instructions only for non-openrouter providers", () => {
    const fields = createFields();

    expect(buildSystemPromptForProvider(fields, "openrouter")).not.toContain("Provider-specific format instructions:");
    expect(buildSystemPromptForProvider(fields, "codex")).not.toContain("Provider-specific format instructions:");
    expect(buildSystemPromptForProvider(fields, "lmstudio")).toContain("Provider-specific format instructions:");
    expect(buildSystemPromptForProvider(fields, "lmstudio")).toContain("**Front**: <value>");
    expect(buildSystemPromptForProvider(fields, "opencodeGo")).toContain("Provider-specific format instructions:");
    expect(buildSystemPromptForProvider(fields, "opencodeGo")).toContain("**Front**: <value>");
    expect(buildSystemPromptForProvider(fields, "opencodeZen")).toContain("Provider-specific format instructions:");
    expect(buildSystemPromptForProvider(fields, "opencodeZen")).toContain("**Front**: <value>");
  });

  it("validates required and optional generated card content", () => {
    const schema = getCardContentSchema([
      { id: 1, title: "Front", type: "text", isRequired: true },
      { id: 2, title: "Back", type: "text", isRequired: false },
    ]);

    expect(
      schema.parse({
        content: {
          "1": { text: "Question" },
          "2": { text: "" },
        },
      }),
    ).toEqual({
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
      }),
    ).toThrow();
  });

  it("parses fenced json card output from Ollama responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message: {
                content: ["```json", '[{"content":{"1":{"text":"Question"},"2":{"text":"Answer"}}}]', "```"].join("\n"),
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );
    const request = createRequest();

    await generateCardsWithOllama(request, { provider: "ollama", baseUrl: "http://localhost:11434" });

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
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
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
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
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
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message: {
                content: ["```json", '[{"content":{"1":{"text":""},"2":{"text":"Answer"}}}]', "```"].join("\n"),
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );
    const request = createRequest();

    await expect(
      generateCardsWithOllama(request, { provider: "ollama", baseUrl: "http://localhost:11434" }),
    ).rejects.toMatchObject({
      code: "ai.invalid-response",
    });
    expect(request.onCard).not.toHaveBeenCalled();
  });

  it("rejects LM Studio cards that fail schema validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: ["## Card 1", "**Front**:", "**Back**: Only back"].join("\n"),
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );
    const request = createRequest();

    await expect(
      generateCardsWithLMStudio(request, { provider: "lmstudio", baseUrl: "http://localhost:1234" }),
    ).rejects.toMatchObject({
      code: "ai.invalid-response",
    });
    expect(request.onCard).not.toHaveBeenCalled();
  });

  it("resolves without cards when LM Studio omits message content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: null,
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );
    const request = createRequest();

    await generateCardsWithLMStudio(request, { provider: "lmstudio", baseUrl: "http://localhost:1234" });

    expect(request.onCard).not.toHaveBeenCalled();
  });

  it("parses markdown card output from OpenCode Go responses", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: ["## Card 1", "**Front**: First question", "**Back**: First answer"].join("\n"),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = createRequest();

    await generateCardsWithOpencodeGo(request, { provider: "opencodeGo", apiKey: "test-key" });

    expect(request.onCard).toHaveBeenCalledTimes(1);
    expect(request.onCard).toHaveBeenCalledWith({
      content: {
        "1": { text: "First question" },
        "2": { text: "First answer" },
      },
    });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call?.[0]?.toString()).toBe(`${OPENCODE_GO_BASE_URL}/chat/completions`);
    const init = call?.[1];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["Authorization"] ?? headers["authorization"]).toBe("Bearer test-key");
    const body = JSON.parse(init?.body as string) as {
      model: string;
      messages: Array<{ role: string }>;
    };
    expect(body.model).toBe("openrouter/gpt-5-mini");
    expect(body.messages[0]?.role).toBe("system");
  });

  it("parses markdown card output from OpenCode Zen responses", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: ["## Card 1", "**Front**: First question", "**Back**: First answer"].join("\n"),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = createRequest();

    await generateCardsWithOpencodeZen(request, { provider: "opencodeZen", apiKey: "test-key" });

    expect(request.onCard).toHaveBeenCalledTimes(1);
    expect(request.onCard).toHaveBeenCalledWith({
      content: {
        "1": { text: "First question" },
        "2": { text: "First answer" },
      },
    });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call?.[0]?.toString()).toBe(`${OPENCODE_ZEN_BASE_URL}/chat/completions`);
    const init = call?.[1];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["Authorization"] ?? headers["authorization"]).toBe("Bearer test-key");
    const body = JSON.parse(init?.body as string) as {
      model: string;
      messages: Array<{ role: string }>;
    };
    expect(body.model).toBe("openrouter/gpt-5-mini");
    expect(body.messages[0]?.role).toBe("system");
  });
});
