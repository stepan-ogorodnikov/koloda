import { generateText, streamText } from "ai";
import type * as AiSdk from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateCardsWithOllama } from "./card-generation";
import type { CardGenerationFields, CardGenerationRequest } from "./generation";
import { compilePromptTemplate } from "./prompts";
import { DEFAULT_GENERATION_PROMPT_TEMPLATE } from "./prompts";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof AiSdk>();
  return {
    ...actual,
    streamText: vi.fn(),
    generateText: vi.fn(),
  };
});

const OLLAMA_OPTIONS = { baseUrl: "http://localhost:11434" };

function createFields(): CardGenerationFields {
  return [
    { id: 1, title: "Front", type: "text", isRequired: true },
    { id: 2, title: "Back", type: "text", isRequired: false },
  ];
}

function createCardsRequest(dataContext?: string): CardGenerationRequest {
  return {
    template: { content: { fields: createFields() } },
    input: {
      modelId: "llama3",
      prompt: "Create cards",
      temperature: 0.2,
      deckId: 1,
      templateId: 1,
    },
    onCard: vi.fn(),
    ...(dataContext !== undefined ? { dataContext } : {}),
  };
}

// WHY: zero structured elements forces the plain-text fallback path, so the
// same compiled system prompt can be asserted on both provider calls.
function mockEmptyCardsStream() {
  vi.mocked(streamText).mockReturnValue({
    elementStream: (async function* () {})(),
    text: Promise.resolve(""),
  } as never);
  vi.mocked(generateText).mockResolvedValue({ text: "" } as never);
}

function streamTextSystemPrompt(call = 0): string {
  const options = vi.mocked(streamText).mock.calls[call]?.[0] as { system?: string };
  return options?.system ?? "";
}

describe("data context prompt seam", () => {
  beforeEach(() => {
    vi.mocked(streamText).mockReset();
    vi.mocked(generateText).mockReset();
  });

  it("appends dataContext after the compiled card generation prompt", async () => {
    mockEmptyCardsStream();
    const dataContext = "Deck: Spanish verbs (12 cards)";
    const request = createCardsRequest(dataContext);

    await generateCardsWithOllama(request, OLLAMA_OPTIONS);

    const expected = compilePromptTemplate(DEFAULT_GENERATION_PROMPT_TEMPLATE, createFields(), "ollama", "generation");
    expect(streamTextSystemPrompt()).toBe(`${expected}\n\n${dataContext}`);
  });

  it("keeps the card generation prompt byte-identical when dataContext is absent", async () => {
    mockEmptyCardsStream();
    const request = createCardsRequest();

    await generateCardsWithOllama(request, OLLAMA_OPTIONS);

    const expected = compilePromptTemplate(DEFAULT_GENERATION_PROMPT_TEMPLATE, createFields(), "ollama", "generation");
    expect(streamTextSystemPrompt()).toBe(expected);
    const fallbackOptions = vi.mocked(generateText).mock.calls[0]?.[0] as { system?: string };
    expect(fallbackOptions?.system).toBe(expected);
  });

  it("keeps the card generation prompt byte-identical when dataContext is empty", async () => {
    mockEmptyCardsStream();
    const request = createCardsRequest("");

    await generateCardsWithOllama(request, OLLAMA_OPTIONS);

    const expected = compilePromptTemplate(DEFAULT_GENERATION_PROMPT_TEMPLATE, createFields(), "ollama", "generation");
    expect(streamTextSystemPrompt()).toBe(expected);
  });

  it("passes the appended prompt to the plain-text card fallback call", async () => {
    mockEmptyCardsStream();
    const dataContext = "Deck: Spanish verbs (12 cards)";
    const request = createCardsRequest(dataContext);

    await generateCardsWithOllama(request, OLLAMA_OPTIONS);

    const expected =
      compilePromptTemplate(DEFAULT_GENERATION_PROMPT_TEMPLATE, createFields(), "ollama", "generation") +
      `\n\n${dataContext}`;
    const fallbackOptions = vi.mocked(generateText).mock.calls[0]?.[0] as { system?: string };
    expect(fallbackOptions?.system).toBe(expected);
  });
});
