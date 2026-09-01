import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIModel } from "../models";
import { OPENCODE_ZEN_BASE_URL } from "../provider-catalog";
import {
  MODELS_DEV_API_URL,
  loadModelsDevCatalog,
  overlayReasoningFromModelsDev,
  resetModelsDevCache,
} from "./models-dev";
import { fetchOpencodeZenModels } from "./opencode-zen";

afterEach(() => {
  vi.unstubAllGlobals();
  resetModelsDevCache();
});

const prefixDeepseek = {
  levels: [
    { effort: "low", description: "" },
    { effort: "medium", description: "" },
    { effort: "high", description: "" },
    { effort: "xhigh", description: "" },
  ],
  default: "medium",
};

function gatewayModel(id: string, extra: Partial<AIModel> = {}): AIModel {
  return { id, name: id, context_length: 0, ...extra };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function catalogFor(providerKey: string, models: Record<string, unknown>): Record<string, unknown> {
  return { [providerKey]: { id: providerKey, name: providerKey, env: [], models } };
}

describe("overlayReasoningFromModelsDev", () => {
  it("applies catalog effort values and defaults to the first value when no default field is set", () => {
    const catalog = catalogFor("opencode", {
      "deepseek-chat": {
        reasoning: true,
        reasoning_options: [{ type: "effort", values: ["low", "high", "max"] }],
      },
    });

    const [model] = overlayReasoningFromModelsDev([gatewayModel("deepseek-chat")], "opencode", catalog);

    expect(model?.supported_reasoning_levels).toEqual([
      { effort: "low", description: "" },
      { effort: "high", description: "" },
      { effort: "max", description: "" },
    ]);
    expect(model?.default_reasoning_level).toBe("low");
  });

  it("uses a catalog default field when it is one of the effort values", () => {
    const catalog = catalogFor("opencode", {
      "deepseek-chat": {
        reasoning_options: [{ type: "effort", values: ["low", "high", "max"], default: "high" }],
      },
    });

    const [model] = overlayReasoningFromModelsDev([gatewayModel("deepseek-chat")], "opencode", catalog);

    expect(model?.default_reasoning_level).toBe("high");
  });

  it("returns no levels when the catalog row has empty reasoning_options even for prefix ids", () => {
    const catalog = catalogFor("opencode", {
      "deepseek-chat": { reasoning: true, reasoning_options: [] },
      "mimo-v2": { reasoning: true },
    });

    const models = overlayReasoningFromModelsDev(
      [gatewayModel("deepseek-chat"), gatewayModel("mimo-v2")],
      "opencode",
      catalog,
    );

    expect(models[0]?.supported_reasoning_levels).toBeUndefined();
    expect(models[0]?.default_reasoning_level).toBeUndefined();
    expect(models[1]?.supported_reasoning_levels).toBeUndefined();
    expect(models[1]?.default_reasoning_level).toBeUndefined();
  });

  it("ignores toggle and budget_tokens options", () => {
    const catalog = catalogFor("opencode", {
      "deepseek-chat": {
        reasoning: true,
        reasoning_options: [{ type: "toggle" }, { type: "budget_tokens", min: 1024 }],
      },
    });

    const [model] = overlayReasoningFromModelsDev([gatewayModel("deepseek-chat")], "opencode", catalog);

    expect(model?.supported_reasoning_levels).toBeUndefined();
  });

  it("joins opencode-go catalog rows by exact id", () => {
    const catalog = catalogFor("opencode-go", {
      "deepseek-chat": {
        reasoning_options: [{ type: "effort", values: ["low", "high"] }],
      },
    });

    const [model] = overlayReasoningFromModelsDev([gatewayModel("deepseek-chat")], "opencode-go", catalog);

    expect(model?.supported_reasoning_levels).toEqual([
      { effort: "low", description: "" },
      { effort: "high", description: "" },
    ]);
    expect(model?.default_reasoning_level).toBe("low");
  });

  it("uses the prefix table when the id is not in the catalog", () => {
    const catalog = catalogFor("opencode", {
      "other-model": { reasoning_options: [{ type: "effort", values: ["high"] }] },
    });

    const [model] = overlayReasoningFromModelsDev([gatewayModel("deepseek-chat")], "opencode", catalog);

    expect(model?.supported_reasoning_levels).toEqual(prefixDeepseek.levels);
    expect(model?.default_reasoning_level).toBe(prefixDeepseek.default);
  });

  it("keeps gateway reasoning fields when already set", () => {
    const catalog = catalogFor("opencode", {
      "deepseek-chat": {
        reasoning_options: [{ type: "effort", values: ["low", "high", "max"] }],
      },
    });

    const [model] = overlayReasoningFromModelsDev(
      [
        gatewayModel("deepseek-chat", {
          supported_reasoning_levels: [{ effort: "gateway", description: "" }],
          default_reasoning_level: "gateway",
        }),
      ],
      "opencode",
      catalog,
    );

    expect(model?.supported_reasoning_levels).toEqual([{ effort: "gateway", description: "" }]);
    expect(model?.default_reasoning_level).toBe("gateway");
  });
});

function stubGatewayAndCatalog(options: { gateway: unknown; catalog: Response | Promise<Response> | Error }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === MODELS_DEV_API_URL) {
        if (options.catalog instanceof Error) throw options.catalog;
        return options.catalog;
      }
      if (url === `${OPENCODE_ZEN_BASE_URL.replace(/\/$/, "")}/models`) {
        return jsonResponse(options.gateway);
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

describe("fetchOpencodeZenModels catalog join", () => {
  it("applies catalog effort values for a matching id", async () => {
    stubGatewayAndCatalog({
      gateway: { data: [{ id: "deepseek-chat", name: "DeepSeek Chat" }] },
      catalog: jsonResponse(
        catalogFor("opencode", {
          "deepseek-chat": {
            reasoning_options: [{ type: "effort", values: ["low", "high", "max"] }],
          },
        }),
      ),
    });

    const models = await fetchOpencodeZenModels("key");

    expect(models).toEqual([
      {
        id: "deepseek-chat",
        name: "DeepSeek Chat",
        description: undefined,
        context_length: 0,
        top_provider: undefined,
        architecture: undefined,
        supported_parameters: undefined,
        supported_reasoning_levels: [
          { effort: "low", description: "" },
          { effort: "high", description: "" },
          { effort: "max", description: "" },
        ],
        default_reasoning_level: "low",
      },
    ]);
  });

  it("falls back to the prefix table when models.dev fails and the cache is empty", async () => {
    stubGatewayAndCatalog({
      gateway: { data: [{ id: "deepseek-chat" }, { id: "plain" }] },
      catalog: new Error("network"),
    });

    const models = await fetchOpencodeZenModels();

    expect(models.map((model) => model.id)).toEqual(["deepseek-chat", "plain"]);
    expect(models[0]?.supported_reasoning_levels).toEqual(prefixDeepseek.levels);
    expect(models[0]?.default_reasoning_level).toBe("medium");
    expect(models[1]?.supported_reasoning_levels).toBeUndefined();
  });

  it("reuses a successful catalog after a later models.dev failure", async () => {
    const catalogBody = catalogFor("opencode", {
      "deepseek-chat": {
        reasoning_options: [{ type: "effort", values: ["low", "high", "max"] }],
      },
    });
    const gateway = { data: [{ id: "deepseek-chat" }] };

    stubGatewayAndCatalog({ gateway, catalog: jsonResponse(catalogBody) });
    await expect(fetchOpencodeZenModels()).resolves.toMatchObject([
      { id: "deepseek-chat", default_reasoning_level: "low" },
    ]);

    stubGatewayAndCatalog({ gateway, catalog: new Response("nope", { status: 403 }) });
    await expect(fetchOpencodeZenModels()).resolves.toMatchObject([
      {
        id: "deepseek-chat",
        supported_reasoning_levels: [
          { effort: "low", description: "" },
          { effort: "high", description: "" },
          { effort: "max", description: "" },
        ],
        default_reasoning_level: "low",
      },
    ]);
  });

  it("sends a browser-like User-Agent to models.dev", async () => {
    stubGatewayAndCatalog({
      gateway: { data: [] },
      catalog: jsonResponse({}),
    });

    await fetchOpencodeZenModels();
    await loadModelsDevCatalog();

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const modelsDevCall = fetchMock.mock.calls.find(([input]) => String(input) === MODELS_DEV_API_URL);
    expect(modelsDevCall?.[1]).toMatchObject({
      headers: {
        Accept: "application/json",
        "User-Agent": expect.stringContaining("Mozilla/5.0"),
      },
    });
  });
});
