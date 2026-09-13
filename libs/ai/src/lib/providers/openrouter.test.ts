import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENROUTER_MODELS_URL, fetchOpenRouterModels } from "./openrouter";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchOpenRouterModels", () => {
  it("filters out models without a vendor-qualified id and requests the public catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "openai/gpt-5", name: "GPT-5" },
            { id: "bare-id", name: "Bare" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOpenRouterModels()).resolves.toEqual([
      {
        id: "openai/gpt-5",
        name: "GPT-5",
        supported_reasoning_levels: undefined,
        default_reasoning_level: undefined,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(OPENROUTER_MODELS_URL, {
      headers: { "Content-Type": "application/json" },
    });
  });

  it("maps reported reasoning efforts to levels with an empty description", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "deepseek/deepseek-r1",
                reasoning: { supported_efforts: ["low", "high"], default_effort: "high" },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchOpenRouterModels()).resolves.toEqual([
      {
        id: "deepseek/deepseek-r1",
        supported_reasoning_levels: [
          { effort: "low", description: "" },
          { effort: "high", description: "" },
        ],
        default_reasoning_level: "high",
      },
    ]);
  });

  it("keeps the default effort when no efforts are reported", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "a/b", reasoning: { default_effort: "medium" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(fetchOpenRouterModels()).resolves.toEqual([
      { id: "a/b", supported_reasoning_levels: undefined, default_reasoning_level: "medium" },
    ]);
  });

  it("omits levels for an empty efforts list but keeps the default effort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ id: "a/b", reasoning: { supported_efforts: [], default_effort: "low" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchOpenRouterModels()).resolves.toEqual([
      { id: "a/b", supported_reasoning_levels: undefined, default_reasoning_level: "low" },
    ]);
  });

  it("sorts by display name, not id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { id: "zulu/model", name: "Alpha" },
              { id: "alpha/model", name: "Zulu" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const models = await fetchOpenRouterModels();

    expect(models.map((model) => ({ id: model.id, name: model.name }))).toEqual([
      { id: "zulu/model", name: "Alpha" },
      { id: "alpha/model", name: "Zulu" },
    ]);
  });

  it("rejects a payload without a model list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { not: "a list" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(fetchOpenRouterModels()).rejects.toMatchObject({
      name: "AIError",
      code: "ai.invalid-response",
    });
  });
});
