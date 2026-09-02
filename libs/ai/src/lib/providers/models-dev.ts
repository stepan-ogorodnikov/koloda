import type { AIModel } from "../models";
import { resolveReasoningLevelsForModel } from "./openai-compatible";

export const MODELS_DEV_API_URL = "https://models.dev/api.json";

const MODELS_DEV_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

type ReasoningLevels = {
  levels: Array<{ effort: string; description: string }>;
  default: string;
};

let cache: Record<string, unknown> | null = null;
let inflight: Promise<Record<string, unknown> | null> | null = null;

export function resetModelsDevCache(): void {
  cache = null;
  inflight = null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveTokenLimit(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function limitsFromCatalogRow(row: unknown): { context?: number; output?: number } | undefined {
  if (!isPlainObject(row) || !isPlainObject(row.limit)) return undefined;
  const context = positiveTokenLimit(row.limit.context);
  const output = positiveTokenLimit(row.limit.output);
  if (context == null && output == null) return undefined;
  return { context, output };
}

function overlayMaxCompletionTokens(
  existing: AIModel["top_provider"],
  output: number | undefined,
): AIModel["top_provider"] {
  if (existing?.max_completion_tokens != null && existing.max_completion_tokens > 0) return existing;
  if (output == null) return existing;
  return { ...existing, max_completion_tokens: output };
}

function effortLevelsFromCatalogRow(row: unknown): ReasoningLevels | undefined {
  if (!isPlainObject(row) || !Array.isArray(row.reasoning_options)) return undefined;

  const effort = row.reasoning_options.find(
    (option): option is Record<string, unknown> => isPlainObject(option) && option.type === "effort",
  );
  if (!effort || !Array.isArray(effort.values)) return undefined;

  const values = effort.values.filter((value): value is string => typeof value === "string" && value.length > 0);
  if (values.length === 0) return undefined;

  const defaultCandidate = [effort.default, effort.default_effort, row.default_effort].find(
    (value): value is string => typeof value === "string" && values.includes(value),
  );

  return {
    levels: values.map((level) => ({ effort: level, description: "" })),
    default: defaultCandidate ?? values[0],
  };
}

function providerModelMap(catalog: unknown, providerKey: string): Record<string, unknown> | null {
  if (!isPlainObject(catalog)) return null;
  const provider = catalog[providerKey];
  if (!isPlainObject(provider) || !isPlainObject(provider.models)) return null;
  return provider.models;
}

export function overlayFromModelsDev(models: AIModel[], providerKey: string, catalog: unknown | null): AIModel[] {
  const modelMap = providerModelMap(catalog, providerKey);

  return models.map((model) => {
    let reasoning: ReasoningLevels | undefined;
    let limits: { context?: number; output?: number } | undefined;
    // WHY: prefix fallback is only for a missing catalog or missing id. An exact
    // catalog row with no effort must stay empty — do not invent levels from a prefix.
    // Limits have no prefix table: fill only from an exact catalog row.
    if (!modelMap) {
      reasoning = resolveReasoningLevelsForModel(model.id);
    } else if (Object.hasOwn(modelMap, model.id)) {
      const row = modelMap[model.id];
      reasoning = effortLevelsFromCatalogRow(row);
      limits = limitsFromCatalogRow(row);
    } else {
      reasoning = resolveReasoningLevelsForModel(model.id);
    }

    return {
      ...model,
      context_length: model.context_length > 0 ? model.context_length : (limits?.context ?? model.context_length),
      top_provider: overlayMaxCompletionTokens(model.top_provider, limits?.output),
      supported_reasoning_levels: model.supported_reasoning_levels ?? reasoning?.levels,
      default_reasoning_level: model.default_reasoning_level ?? reasoning?.default,
    };
  });
}

async function fetchModelsDevCatalog(): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(MODELS_DEV_API_URL, { headers: MODELS_DEV_HEADERS });
    if (!response.ok) return cache;
    const data: unknown = await response.json();
    if (!isPlainObject(data)) return cache;
    cache = data;
    return cache;
  } catch {
    return cache;
  }
}

export async function loadModelsDevCatalog(): Promise<Record<string, unknown> | null> {
  // WHY: api.json is large and changes slowly; reuse a process-lifetime success
  // instead of downloading it on every OpenCode model list.
  if (cache) return cache;
  if (!inflight) {
    inflight = fetchModelsDevCatalog().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
