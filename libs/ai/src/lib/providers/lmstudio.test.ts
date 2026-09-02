import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIModel } from "../models";
import { fetchLmStudioModels, lmStudioReasoningFromCapabilities, overlayLmStudioReasoning } from "./lmstudio";

afterEach(() => {
  vi.unstubAllGlobals();
});

function gatewayModel(id: string, extra: Partial<AIModel> = {}): AIModel {
  return { id, name: id, context_length: 0, ...extra };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("lmStudioReasoningFromCapabilities", () => {
  it("maps allowed_options and a matching default", () => {
    expect(
      lmStudioReasoningFromCapabilities({
        vision: false,
        trained_for_tool_use: true,
        reasoning: { allowed_options: ["off", "on"], default: "on" },
      }),
    ).toEqual({
      supported_reasoning_levels: [
        { effort: "off", description: "" },
        { effort: "on", description: "" },
      ],
      default_reasoning_level: "on",
    });
  });

  it("falls back to the first option when default is missing or not in the list", () => {
    expect(
      lmStudioReasoningFromCapabilities({
        reasoning: { allowed_options: ["low", "medium", "high"] },
      }),
    ).toEqual({
      supported_reasoning_levels: [
        { effort: "low", description: "" },
        { effort: "medium", description: "" },
        { effort: "high", description: "" },
      ],
      default_reasoning_level: "low",
    });
  });

  it("omits levels when reasoning config is absent or empty", () => {
    expect(lmStudioReasoningFromCapabilities({ vision: true })).toBeUndefined();
    expect(lmStudioReasoningFromCapabilities({ reasoning: { allowed_options: [] } })).toBeUndefined();
    expect(lmStudioReasoningFromCapabilities(undefined)).toBeUndefined();
  });
});

describe("overlayLmStudioReasoning", () => {
  it("joins native reasoning onto OpenAI ids and variant ids", () => {
    const catalog = {
      models: [
        {
          type: "llm",
          key: "nvidia/nemotron-3-nano-4b",
          capabilities: { reasoning: { allowed_options: ["off", "on"], default: "on" } },
        },
        { type: "embedding", key: "text-embedding-nomic" },
      ],
    };

    const models = overlayLmStudioReasoning(
      [
        gatewayModel("nvidia/nemotron-3-nano-4b"),
        gatewayModel("nvidia/nemotron-3-nano-4b@q4_k_m"),
        gatewayModel("llama-3.1"),
      ],
      catalog,
    );

    expect(models).toEqual([
      {
        id: "nvidia/nemotron-3-nano-4b",
        name: "nvidia/nemotron-3-nano-4b",
        context_length: 0,
        supported_reasoning_levels: [
          { effort: "off", description: "" },
          { effort: "on", description: "" },
        ],
        default_reasoning_level: "on",
      },
      {
        id: "nvidia/nemotron-3-nano-4b@q4_k_m",
        name: "nvidia/nemotron-3-nano-4b@q4_k_m",
        context_length: 0,
        supported_reasoning_levels: [
          { effort: "off", description: "" },
          { effort: "on", description: "" },
        ],
        default_reasoning_level: "on",
      },
      { id: "llama-3.1", name: "llama-3.1", context_length: 0 },
    ]);
  });

  it("leaves models unchanged when the native catalog is missing or malformed", () => {
    const models = [gatewayModel("local-model")];
    expect(overlayLmStudioReasoning(models, null)).toEqual(models);
    expect(overlayLmStudioReasoning(models, { data: [] })).toEqual(models);
  });
});

describe("fetchLmStudioModels", () => {
  it("overlays native reasoning onto the OpenAI list and keeps listing if native fetch fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/models")) {
        return jsonResponse({
          models: [
            {
              key: "qwen3.5",
              capabilities: { reasoning: { allowed_options: ["off", "low", "medium", "high"], default: "medium" } },
            },
          ],
        });
      }
      return jsonResponse({ data: [{ id: "qwen3.5" }, { id: "llama-3.1" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchLmStudioModels("http://localhost:1234/v1", "secret-key");

    expect(models).toEqual([
      {
        id: "llama-3.1",
        name: "llama-3.1",
        context_length: 0,
      },
      {
        id: "qwen3.5",
        name: "qwen3.5",
        context_length: 0,
        supported_reasoning_levels: [
          { effort: "off", description: "" },
          { effort: "low", description: "" },
          { effort: "medium", description: "" },
          { effort: "high", description: "" },
        ],
        default_reasoning_level: "medium",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/v1/models", "http://localhost:1234/v1"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret-key" }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/api/v1/models", "http://localhost:1234/v1"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret-key" }),
      }),
    );
  });

  it("omits reasoning levels when the native models endpoint is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/models")) return jsonResponse({ error: "not found" }, 404);
        return jsonResponse({ data: [{ id: "local-model" }] });
      }),
    );

    await expect(fetchLmStudioModels("http://localhost:1234")).resolves.toEqual([
      { id: "local-model", name: "local-model", context_length: 0 },
    ]);
  });
});
