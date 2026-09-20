import { afterEach, describe, expect, it, vi } from "vitest";
import { MODELS_DEV_API_URL, resetModelsDevCache } from "./models-dev";
import { DEEPSEEK_MODELS_URL, deepseekProviderEntry, fetchDeepSeekModels } from "./deepseek";

afterEach(() => {
  vi.unstubAllGlobals();
  resetModelsDevCache();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchDeepSeekModels", () => {
  it("joins exact models.dev effort metadata and leaves an exact row without efforts empty", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === DEEPSEEK_MODELS_URL) {
        return jsonResponse({ data: [{ id: "deepseek-v4-pro" }, { id: "deepseek-chat" }] });
      }
      if (url === MODELS_DEV_API_URL) {
        return jsonResponse({
          deepseek: {
            models: {
              "deepseek-v4-pro": {
                reasoning_options: [{ type: "effort", values: ["low", "high", "max"], default: "high" }],
              },
              "deepseek-chat": { reasoning_options: [] },
            },
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDeepSeekModels("secret-key")).resolves.toEqual([
      {
        id: "deepseek-chat",
        name: "deepseek-chat",
        context_length: 0,
        supported_reasoning_levels: undefined,
        default_reasoning_level: undefined,
      },
      {
        id: "deepseek-v4-pro",
        name: "deepseek-v4-pro",
        context_length: 0,
        supported_reasoning_levels: [
          { effort: "low", description: "" },
          { effort: "high", description: "" },
          { effort: "max", description: "" },
        ],
        default_reasoning_level: "high",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(DEEPSEEK_MODELS_URL, {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-key",
      },
    });
  });

  it("uses the documented DeepSeek fallback when models.dev is unavailable", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === DEEPSEEK_MODELS_URL) return jsonResponse({ data: [{ id: "deepseek-chat" }, { id: "plain-model" }] });
      if (url === MODELS_DEV_API_URL) throw new Error("models.dev unavailable");
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDeepSeekModels("secret-key")).resolves.toMatchObject([
      {
        id: "deepseek-chat",
        default_reasoning_level: "medium",
        supported_reasoning_levels: [
          { effort: "low", description: "" },
          { effort: "medium", description: "" },
          { effort: "high", description: "" },
          { effort: "xhigh", description: "" },
        ],
      },
      { id: "plain-model", supported_reasoning_levels: undefined, default_reasoning_level: undefined },
    ]);
  });

  it("rejects a payload without a model list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === DEEPSEEK_MODELS_URL) return jsonResponse({ data: { not: "a list" } });
        return jsonResponse({});
      }),
    );

    await expect(fetchDeepSeekModels("secret-key")).rejects.toMatchObject({
      name: "AIError",
      code: "ai.invalid-response",
    });
  });
});

describe("deepseekProviderEntry", () => {
  it("requires an API key before fetching models", async () => {
    await expect(deepseekProviderEntry.fetchModels({ provider: "deepseek", apiKey: null })).rejects.toMatchObject({
      name: "AIError",
      code: "validation.settings-ai.providers.api-key",
    });
  });
});
