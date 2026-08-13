import { generateText, streamText } from "ai";
import type * as AiSdk from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateCardsWithOllama } from "./card-generation";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof AiSdk>();
  return {
    ...actual,
    streamText: vi.fn(),
    generateText: vi.fn(),
  };
});

function createRequest() {
  return {
    template: {
      content: {
        fields: [
          { id: 1, title: "Front", type: "text" as const, isRequired: true },
          { id: 2, title: "Back", type: "text" as const, isRequired: false },
        ],
      },
    },
    input: {
      modelId: "llama3",
      prompt: "Create cards",
      temperature: 0.2,
      deckId: 1,
      templateId: 1,
    },
    onCard: vi.fn(),
  };
}

describe("card-generation fallback guard", () => {
  beforeEach(() => {
    vi.mocked(streamText).mockReset();
    vi.mocked(generateText).mockReset();
  });

  it("does not call generateText after partial structured cards then a stream error", async () => {
    const partialCard = {
      content: {
        "1": { text: "Question" },
        "2": { text: "Answer" },
      },
    };

    vi.mocked(streamText).mockReturnValue({
      elementStream: (async function* () {
        yield partialCard;
        throw new Error("provider failed after partial output");
      })(),
      text: Promise.resolve(""),
    } as never);

    const request = createRequest();

    await expect(generateCardsWithOllama(request, { baseUrl: "http://localhost:11434" })).rejects.toMatchObject({
      code: "unknown",
      message: "provider failed after partial output",
    });

    expect(request.onCard).toHaveBeenCalledTimes(1);
    expect(request.onCard).toHaveBeenCalledWith(partialCard);
    expect(generateText).not.toHaveBeenCalled();
  });
});
