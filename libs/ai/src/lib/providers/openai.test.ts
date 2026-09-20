import { afterEach, describe, expect, it, vi } from "vitest";
import { aiSecretsValidation } from "../provider-secrets";
import { MODELS_DEV_API_URL, resetModelsDevCache } from "./models-dev";
import { OPENAI_BASE_URL, fetchOpenAIModels, openaiProviderEntry } from "./openai";

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

describe("fetchOpenAIModels", () => {
  it("fetches the OpenAI-compatible models list with the api key", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === new URL("/v1/models", OPENAI_BASE_URL).href) {
        return Promise.resolve(jsonResponse({ data: [{ id: "gpt-5" }, { id: "gpt-4o" }] }));
      }
      if (String(input) === MODELS_DEV_API_URL) return Promise.resolve(jsonResponse({}));
      return Promise.reject(new Error(`unexpected fetch: ${String(input)}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOpenAIModels("secret-key")).resolves.toEqual([
      { id: "gpt-4o", name: "gpt-4o", context_length: 0 },
      { id: "gpt-5", name: "gpt-5", context_length: 0 },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(new URL("/v1/models", OPENAI_BASE_URL), {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-key",
      },
    });
  });

  it("adds reasoning levels from the matching models.dev catalog row", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === new URL("/v1/models", OPENAI_BASE_URL).href) {
        return Promise.resolve(jsonResponse({ data: [{ id: "gpt-5" }] }));
      }
      if (String(input) === MODELS_DEV_API_URL) {
        return Promise.resolve(
          jsonResponse({
            openai: {
              models: {
                "gpt-5": {
                  reasoning_options: [{ type: "effort", values: ["low", "medium", "high"], default: "high" }],
                },
              },
            },
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${String(input)}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOpenAIModels("secret-key")).resolves.toEqual([
      {
        id: "gpt-5",
        name: "gpt-5",
        context_length: 0,
        supported_reasoning_levels: [
          { effort: "low", description: "" },
          { effort: "medium", description: "" },
          { effort: "high", description: "" },
        ],
        default_reasoning_level: "high",
      },
    ]);
  });

  it("rejects a malformed model list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input) === MODELS_DEV_API_URL
          ? Promise.resolve(jsonResponse({}))
          : Promise.resolve(jsonResponse({ data: {} })),
      ),
    );

    await expect(fetchOpenAIModels("secret-key")).rejects.toMatchObject({ code: "ai.invalid-response" });
  });
});

describe("openaiProviderEntry", () => {
  it("requires apiKey when listing models", async () => {
    await expect(openaiProviderEntry.fetchModels({ provider: "openai", apiKey: null })).rejects.toMatchObject({
      code: "validation.settings-ai.providers.api-key",
    });
  });

  it("lists models with a present apiKey", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input) === MODELS_DEV_API_URL
          ? Promise.resolve(jsonResponse({}))
          : Promise.resolve(jsonResponse({ data: [] })),
      ),
    );

    const secrets = aiSecretsValidation.parse({ provider: "openai", apiKey: "secret-key" });
    await expect(openaiProviderEntry.fetchModels(secrets)).resolves.toEqual([]);
  });
});
