import { afterEach, describe, expect, it, vi } from "vitest";
import { aiSecretsValidation, ollamaSecretsValidation } from "../provider-secrets";
import { fetchOllamaModels, ollamaProviderEntry } from "./ollama";

const listMock = vi.fn();
const OllamaMock = vi.fn().mockImplementation(function Ollama() {
  return { list: listMock };
});

vi.mock("ollama", () => ({
  Ollama: OllamaMock,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  OllamaMock.mockClear();
  listMock.mockReset();
});

describe("fetchOllamaModels", () => {
  it("passes the apiKey to the Ollama client when provided", async () => {
    listMock.mockResolvedValueOnce({
      models: [{ model: "llama3.1", name: "Llama 3.1" }],
    });

    const models = await fetchOllamaModels("https://example.com", "secret-key");

    expect(models).toEqual([{ id: "llama3.1", name: "Llama 3.1", context_length: 0 }]);
    expect(OllamaMock).toHaveBeenCalledTimes(1);
    expect(OllamaMock).toHaveBeenCalledWith({
      host: "https://example.com",
      apiKey: "secret-key",
    });
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it("omits the apiKey from the Ollama client when not provided", async () => {
    listMock.mockResolvedValueOnce({ models: [] });

    await fetchOllamaModels("http://localhost:11434");

    expect(OllamaMock).toHaveBeenCalledTimes(1);
    expect(OllamaMock).toHaveBeenCalledWith({
      host: "http://localhost:11434",
    });
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it("advertises low/medium/high thinking levels for gpt-oss when capabilities include thinking", async () => {
    listMock.mockResolvedValueOnce({
      models: [{ model: "gpt-oss:20b", name: "gpt-oss:20b", capabilities: ["thinking"] }],
    });

    const models = await fetchOllamaModels("http://localhost:11434");

    expect(models).toEqual([
      {
        id: "gpt-oss:20b",
        name: "gpt-oss:20b",
        context_length: 0,
        supported_reasoning_levels: [
          { effort: "low", description: "" },
          { effort: "medium", description: "" },
          { effort: "high", description: "" },
        ],
        default_reasoning_level: "medium",
      },
    ]);
  });

  it("advertises on/off thinking for non-gpt-oss models that only accept a boolean think flag", async () => {
    listMock.mockResolvedValueOnce({
      models: [{ model: "qwen3:8b", name: "qwen3:8b", capabilities: ["thinking"] }],
    });

    const models = await fetchOllamaModels("http://localhost:11434");

    expect(models).toEqual([
      {
        id: "qwen3:8b",
        name: "qwen3:8b",
        context_length: 0,
        supported_reasoning_levels: [
          { effort: "off", description: "" },
          { effort: "on", description: "" },
        ],
        default_reasoning_level: "on",
      },
    ]);
  });

  it("omits reasoning levels when capabilities is missing or does not include thinking", async () => {
    listMock.mockResolvedValueOnce({
      models: [
        { model: "llama3.1", name: "Llama 3.1" },
        { model: "qwen2.5", name: "qwen2.5", capabilities: ["completion"] },
      ],
    });

    const models = await fetchOllamaModels("http://localhost:11434");

    expect(models).toEqual([
      { id: "llama3.1", name: "Llama 3.1", context_length: 0 },
      { id: "qwen2.5", name: "qwen2.5", context_length: 0 },
    ]);
  });

  it("sorts models by display name, not model id", async () => {
    listMock.mockResolvedValueOnce({
      models: [
        { model: "zulu", name: "Alpha" },
        { model: "alpha", name: "Zulu" },
      ],
    });

    const models = await fetchOllamaModels("http://localhost:11434");

    expect(models).toEqual([
      { id: "zulu", name: "Alpha", context_length: 0 },
      { id: "alpha", name: "Zulu", context_length: 0 },
    ]);
  });

  it("maps a models response missing the models field to ai.invalid-response", async () => {
    listMock.mockResolvedValueOnce({});

    await expect(fetchOllamaModels("http://localhost:11434")).rejects.toMatchObject({
      code: "ai.invalid-response",
      message: "ai.invalid-response",
    });
  });
});

describe("ollamaSecretsValidation", () => {
  it("rejects a whitespace-only baseUrl with the base-url validation code", () => {
    const result = ollamaSecretsValidation.safeParse({ baseUrl: "   " });

    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    expect(issue?.path).toEqual(["baseUrl"]);
    expect(issue?.message).toBe("validation.settings-ai.providers.baseUrl");
  });
});

describe("ollamaProviderEntry", () => {
  it("passes a present apiKey from the secrets when fetching models", async () => {
    listMock.mockResolvedValueOnce({
      models: [{ model: "llama3.1", name: "Llama 3.1" }],
    });

    const secrets = aiSecretsValidation.parse({
      provider: "ollama",
      baseUrl: "https://example.com",
      apiKey: "secret-key",
    });

    const models = await ollamaProviderEntry.fetchModels(secrets);

    expect(models).toEqual([{ id: "llama3.1", name: "Llama 3.1", context_length: 0 }]);
    expect(OllamaMock).toHaveBeenCalledTimes(1);
    expect(OllamaMock).toHaveBeenCalledWith({
      host: "https://example.com",
      apiKey: "secret-key",
    });
  });

  it("omits a redacted apiKey from the Ollama client when fetching models", async () => {
    listMock.mockResolvedValueOnce({ models: [] });

    const secrets = aiSecretsValidation.parse({
      provider: "ollama",
      baseUrl: "https://example.com",
      apiKey: null,
    });

    await ollamaProviderEntry.fetchModels(secrets);

    expect(OllamaMock).toHaveBeenCalledTimes(1);
    expect(OllamaMock).toHaveBeenCalledWith({
      host: "https://example.com",
    });
  });
});
