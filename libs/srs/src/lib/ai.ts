import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { throwForAIResponse, wrapAIError } from "./ai-error";
import type { ChatStreamGenerator, GenerateCardsFunction } from "./ai-cards-generation";
import {
  generateCardsWithLMStudio,
  generateCardsWithOllama,
  generateCardsWithOpenRouter,
  streamChatWithLMStudio,
  streamChatWithOllama,
  streamChatWithOpenRouter,
} from "./ai-cards-generation";
import { AppError } from "./error";
import type { AISecrets } from "./settings-ai";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export type AIGenerationClient = {
  provider: AISecrets["provider"];
  listModels: () => Promise<AIModel[]>;
  chat: ChatStreamGenerator;
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
  return wrapAIError(async () => {
    const response = throwForAIResponse(await fetch(OPENROUTER_MODELS_URL, {
      headers: { "Content-Type": "application/json" },
    }));

    const data: OpenRouterModelsResponse = await response.json();
    if (!Array.isArray(data.data)) throw new AppError("ai.invalid-response");

    return data.data
      .filter((model) => model.id.includes("/"))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function fetchOpenAICompatibleModels(baseUrl: string, apiKey?: string): Promise<AIModel[]> {
  return wrapAIError(async () => {
    const response = throwForAIResponse(await fetch(new URL("/v1/models", baseUrl), {
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    }));

    const data: OpenAICompatibleModelsResponse = await response.json();
    if (!Array.isArray(data.data)) throw new AppError("ai.invalid-response");

    return data.data
      .map((model) => ({
        id: model.id,
        name: model.id,
        context_length: 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function fetchOllamaModels(baseUrl: string): Promise<AIModel[]> {
  return wrapAIError(async () => {
    const response = throwForAIResponse(await fetch(new URL("/api/tags", baseUrl), {
      headers: { "Content-Type": "application/json" },
    }));

    const data: OllamaModelsResponse = await response.json();
    if (!Array.isArray(data.models)) throw new AppError("ai.invalid-response");

    return data.models
      .map((model) => ({
        id: model.model,
        name: model.name ?? model.model,
        context_length: 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

function createOpenRouterClient(secrets: Extract<AISecrets, { provider: "openrouter" }>): AIGenerationClient {
  const openrouter = createOpenRouter({ apiKey: secrets.apiKey });

  return {
    provider: "openrouter",
    listModels: fetchOpenRouterModels,
    chat: (request, onChunk, abortSignal) => streamChatWithOpenRouter(request, onChunk, abortSignal, openrouter),
    generateCards: (request) => generateCardsWithOpenRouter(request, openrouter),
  };
}

function createOllamaClient(secrets: Extract<AISecrets, { provider: "ollama" }>): AIGenerationClient {
  return {
    provider: "ollama",
    listModels: () => fetchOllamaModels(secrets.baseUrl),
    chat: (request, onChunk, abortSignal) => streamChatWithOllama(request, onChunk, abortSignal, secrets.baseUrl),
    generateCards: (request) => generateCardsWithOllama(request, secrets.baseUrl),
  };
}

function createLmStudioClient(secrets: Extract<AISecrets, { provider: "lmstudio" }>): AIGenerationClient {
  return {
    provider: "lmstudio",
    listModels: () => fetchOpenAICompatibleModels(secrets.baseUrl, secrets.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithLMStudio(request, onChunk, abortSignal, secrets),
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
