import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOllamaModels } from "./ollama";

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

  it("maps a models response missing the models field to ai.invalid-response", async () => {
    listMock.mockResolvedValueOnce({});

    await expect(fetchOllamaModels("http://localhost:11434")).rejects.toMatchObject({
      code: "ai.invalid-response",
      message: "ai.invalid-response",
    });
  });
});
