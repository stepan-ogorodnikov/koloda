import { generateText, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { wrapModelWithReasoningExtraction } from "./model-reasoning-extraction";

const emptyUsage = {
  inputTokens: { total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: undefined, reasoning: undefined },
};

describe("wrapModelWithReasoningExtraction", () => {
  it("strips think tags from generateText output", async () => {
    const model = wrapModelWithReasoningExtraction(
      new MockLanguageModelV3({
        doGenerate: {
          content: [{ type: "text", text: "<think>hidden</think>Visible answer" }],
          finishReason: { unified: "stop", raw: undefined },
          usage: emptyUsage,
          warnings: [],
        },
      }),
    );

    const result = await generateText({ model, prompt: "Hi" });
    expect(result.text).toBe("Visible answer");
    expect(result.text).not.toContain("<think>");
  });

  it("strips think tags from textStream", async () => {
    const model = wrapModelWithReasoningExtraction(
      new MockLanguageModelV3({
        doStream: {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t1" },
              { type: "text-delta", id: "t1", delta: "<think>hidden</think>Hello" },
              { type: "text-end", id: "t1" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage: emptyUsage,
              },
            ],
          }),
        },
      }),
    );

    const result = streamText({ model, prompt: "Hi" });
    let text = "";
    for await (const chunk of result.textStream) {
      text += chunk;
    }
    expect(text).toBe("Hello");
    expect(text).not.toContain("<think>");
  });

  // WHY: real streams can chunk anywhere, including mid-tag ("<thi" + "nk>");
  // extraction must buffer partial tags instead of leaking fragments.
  it("buffers a think open tag split mid-tag across stream deltas", async () => {
    const model = wrapModelWithReasoningExtraction(
      new MockLanguageModelV3({
        doStream: {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t1" },
              { type: "text-delta", id: "t1", delta: "Before<thi" },
              { type: "text-delta", id: "t1", delta: "nk>secret plan</think>Visible answer" },
              { type: "text-end", id: "t1" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage: emptyUsage,
              },
            ],
          }),
        },
      }),
    );

    const result = streamText({ model, prompt: "Hi" });
    let reasoning = "";
    let text = "";
    for await (const chunk of result.fullStream) {
      if (chunk.type === "reasoning-delta") reasoning += chunk.text;
      if (chunk.type === "text-delta") text += chunk.text;
    }
    expect(reasoning).toBe("secret plan");
    // WHY: the middleware joins text segments separated by a think block with
    // its default "\n" separator, matching the non-streaming wrapGenerate path.
    expect(text).toBe("Before\nVisible answer");
    expect(text).not.toContain("<think>");
  });

  it("buffers a think closing tag split mid-tag across stream deltas", async () => {
    const model = wrapModelWithReasoningExtraction(
      new MockLanguageModelV3({
        doStream: {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t1" },
              { type: "text-delta", id: "t1", delta: "<think>quiet plan</thi" },
              { type: "text-delta", id: "t1", delta: "nk>All done" },
              { type: "text-end", id: "t1" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage: emptyUsage,
              },
            ],
          }),
        },
      }),
    );

    const result = streamText({ model, prompt: "Hi" });
    let reasoning = "";
    let text = "";
    for await (const chunk of result.fullStream) {
      if (chunk.type === "reasoning-delta") reasoning += chunk.text;
      if (chunk.type === "text-delta") text += chunk.text;
    }
    expect(reasoning).toBe("quiet plan");
    expect(text).toBe("All done");
    expect(text).not.toContain("</think>");
  });
});
