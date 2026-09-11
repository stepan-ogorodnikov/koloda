import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOpenAICompatibleModels,
  fetchOpenAICompatibleModelsDetailed,
  resolveReasoningLevelsForModel,
} from "./openai-compatible";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveReasoningLevelsForModel", () => {
  it("maps deepseek-* to low/medium/high/xhigh with default medium", () => {
    expect(resolveReasoningLevelsForModel("deepseek-chat")).toEqual({
      levels: [
        { effort: "low", description: "" },
        { effort: "medium", description: "" },
        { effort: "high", description: "" },
        { effort: "xhigh", description: "" },
      ],
      default: "medium",
    });
  });

  it("maps mimo-* to low/medium/high with default medium", () => {
    expect(resolveReasoningLevelsForModel("mimo-v2")).toEqual({
      levels: [
        { effort: "low", description: "" },
        { effort: "medium", description: "" },
        { effort: "high", description: "" },
      ],
      default: "medium",
    });
  });

  it("returns undefined for other ids", () => {
    expect(resolveReasoningLevelsForModel("gpt-5")).toBeUndefined();
  });
});

describe("fetchOpenAICompatibleModelsDetailed", () => {
  it("maps gateway metadata without attaching prefix reasoning levels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "deepseek-chat",
                name: "DeepSeek Chat",
                description: "chat",
                context_length: 128000,
              },
              { id: "mimo-v2", context_window: 64000 },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const models = await fetchOpenAICompatibleModelsDetailed("https://example.com/models", "key");

    expect(models).toEqual([
      {
        id: "deepseek-chat",
        name: "DeepSeek Chat",
        description: "chat",
        context_length: 128000,
        top_provider: undefined,
        architecture: undefined,
        supported_parameters: undefined,
        supported_reasoning_levels: undefined,
        default_reasoning_level: undefined,
      },
      {
        id: "mimo-v2",
        name: "mimo-v2",
        description: undefined,
        context_length: 64000,
        top_provider: undefined,
        architecture: undefined,
        supported_parameters: undefined,
        supported_reasoning_levels: undefined,
        default_reasoning_level: undefined,
      },
    ]);
  });

  it("keeps gateway reasoning fields when present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "deepseek-chat",
                supported_reasoning_levels: [{ effort: "high", description: "from gateway" }],
                default_reasoning_level: "high",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const models = await fetchOpenAICompatibleModelsDetailed("https://example.com/models");

    expect(models[0]?.supported_reasoning_levels).toEqual([{ effort: "high", description: "from gateway" }]);
    expect(models[0]?.default_reasoning_level).toBe("high");
  });

  it("sorts by display name, not id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { id: "zulu", name: "Alpha" },
              { id: "alpha", name: "Zulu" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const models = await fetchOpenAICompatibleModelsDetailed("https://example.com/models");

    expect(models.map((model) => ({ id: model.id, name: model.name }))).toEqual([
      { id: "zulu", name: "Alpha" },
      { id: "alpha", name: "Zulu" },
    ]);
  });
});

describe("fetchOpenAICompatibleModels", () => {
  it("maps id-only listings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "local-model" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(fetchOpenAICompatibleModels("http://localhost:1234")).resolves.toEqual([
      { id: "local-model", name: "local-model", context_length: 0 },
    ]);
  });

  it("sorts id-only listings alphabetically", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "zeta" }, { id: "alpha" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(fetchOpenAICompatibleModels("http://localhost:1234")).resolves.toEqual([
      { id: "alpha", name: "alpha", context_length: 0 },
      { id: "zeta", name: "zeta", context_length: 0 },
    ]);
  });
});
