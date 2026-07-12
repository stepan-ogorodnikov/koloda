import { AIError, throwForAIResponse } from "../error";
import type { AIModel } from "../models";

export type OpenAICompatibleModelData = {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  context_window?: number;
  top_provider?: AIModel["top_provider"];
  architecture?: AIModel["architecture"];
  supported_parameters?: string[];
  supported_reasoning_levels?: AIModel["supported_reasoning_levels"];
  default_reasoning_level?: string;
};

export type OpenAICompatibleModelsResponse = {
  data: OpenAICompatibleModelData[];
};

type ReasoningLevels = {
  levels: Array<{ effort: string; description: string }>;
  default: string;
};

const MIMO_LEVELS: ReasoningLevels = {
  levels: [
    { effort: "low", description: "" },
    { effort: "medium", description: "" },
    { effort: "high", description: "" },
  ],
  default: "medium",
};

const DEEPSEEK_LEVELS: ReasoningLevels = {
  levels: [
    { effort: "low", description: "" },
    { effort: "medium", description: "" },
    { effort: "high", description: "" },
    { effort: "xhigh", description: "" },
  ],
  default: "medium",
};

export function resolveReasoningLevelsForModel(id: string): ReasoningLevels | undefined {
  const lower = id.toLowerCase();
  if (lower.startsWith("deepseek-")) return DEEPSEEK_LEVELS;
  if (lower.startsWith("mimo-")) return MIMO_LEVELS;
  return undefined;
}

/** Minimal /v1/models listing (id only) — used by LM Studio. */
export async function fetchOpenAICompatibleModels(baseUrl: string, apiKey?: string): Promise<AIModel[]> {
  const response = throwForAIResponse(
    await fetch(new URL("/v1/models", baseUrl), {
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    }),
  );

  const data: OpenAICompatibleModelsResponse = await response.json();
  if (!Array.isArray(data.data)) throw new AIError("ai.invalid-response");

  return data.data
    .map((model) => ({
      id: model.id,
      name: model.id,
      context_length: 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * OpenAI-compatible models endpoint with full metadata + hardcoded reasoning
 * for deepseek-* / mimo-* (Opencode Go / Zen).
 */
export async function fetchOpenAICompatibleModelsDetailed(modelsUrl: string, apiKey?: string): Promise<AIModel[]> {
  const response = throwForAIResponse(
    await fetch(modelsUrl, {
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    }),
  );

  const data: OpenAICompatibleModelsResponse = await response.json();
  if (!Array.isArray(data.data)) throw new AIError("ai.invalid-response");

  return data.data
    .map((model) => {
      const reasoning = resolveReasoningLevelsForModel(model.id);
      return {
        id: model.id,
        name: model.name ?? model.id,
        description: model.description,
        context_length: model.context_length ?? model.context_window ?? 0,
        top_provider: model.top_provider,
        architecture: model.architecture,
        supported_parameters: model.supported_parameters,
        supported_reasoning_levels: model.supported_reasoning_levels ?? reasoning?.levels,
        default_reasoning_level: model.default_reasoning_level ?? reasoning?.default,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
