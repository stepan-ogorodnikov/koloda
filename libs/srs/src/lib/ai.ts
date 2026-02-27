import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { GenerateCardsFunction } from "./ai-cards-generation";
import { generateCardsWithLMStudio, generateCardsWithOllama, generateCardsWithOpenRouter } from "./ai-cards-generation";
import type { AISecrets } from "./settings-ai";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export type AIGenerationClient = {
  provider: AISecrets["provider"];
  listModels: () => Promise<AIModel[]>;
  generateCards: GenerateCardsFunction;
};

export type AIModel = {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  top_provider?: {
    max_completion_tokens?: number;
  };
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
  supported_parameters?: string[];
};

type OpenRouterModelsResponse = { data: AIModel[] };

type OpenAICompatibleModelsResponse = {
  data: Array<{ id: string }>;
};

type OllamaModelsResponse = {
  models?: Array<{
    model: string;
    name?: string;
  }>;
};

export async function fetchOpenRouterModels(): Promise<AIModel[]> {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) throw new Error(`Failed to fetch OpenRouter models: ${response.statusText}`);

  const data: OpenRouterModelsResponse = await response.json();
  return data.data
    .filter((model) => model.id.includes("/"))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchOpenAICompatibleModels(baseUrl: string, apiKey?: string): Promise<AIModel[]> {
  const response = await fetch(new URL("/v1/models", baseUrl), {
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });

  if (!response.ok) throw new Error(`Failed to fetch models: ${response.statusText}`);

  const data: OpenAICompatibleModelsResponse = await response.json();
  return data.data
    .map((model) => ({
      id: model.id,
      name: model.id,
      context_length: 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchOllamaModels(baseUrl: string): Promise<AIModel[]> {
  const response = await fetch(new URL("/api/tags", baseUrl), {
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Ollama models: ${response.statusText}`);
  }

  const data: OllamaModelsResponse = await response.json();
  const models = data.models ?? [];

  return models
    .map((model) => ({
      id: model.model,
      name: model.name ?? model.model,
      context_length: 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function createOpenRouterClient(secrets: Extract<AISecrets, { provider: "openrouter" }>): AIGenerationClient {
  const openrouter = createOpenRouter({ apiKey: secrets.apiKey });

  return {
    provider: "openrouter",
    listModels: fetchOpenRouterModels,
    generateCards: (request) => generateCardsWithOpenRouter(request, openrouter),
  };
}

function createOllamaClient(secrets: Extract<AISecrets, { provider: "ollama" }>): AIGenerationClient {
  return {
    provider: "ollama",
    listModels: () => fetchOllamaModels(secrets.baseUrl),
    generateCards: (request) => generateCardsWithOllama(request, secrets.baseUrl),
  };
}

function createLmStudioClient(secrets: Extract<AISecrets, { provider: "lmstudio" }>): AIGenerationClient {
  return {
    provider: "lmstudio",
    listModels: () => fetchOpenAICompatibleModels(secrets.baseUrl, secrets.apiKey),
    generateCards: (request) => generateCardsWithLMStudio(request, secrets),
  };
}

export function createAIGenerationClient(secretsInput: AISecrets | string): AIGenerationClient {
  const secrets: AISecrets = typeof secretsInput === "string"
    ? ({ provider: "openrouter", apiKey: secretsInput } as const)
    : secretsInput;

  switch (secrets.provider) {
    case "openrouter":
      return createOpenRouterClient(secrets);
    case "ollama":
      return createOllamaClient(secrets);
    case "lmstudio":
      return createLmStudioClient(secrets);
  }
}

export async function fetchModels(secrets?: AISecrets | null): Promise<AIModel[]> {
  if (!secrets) return fetchOpenRouterModels();
  return createAIGenerationClient(secrets).listModels();
}
