import type { AIModel, AIProfile, GeneratedCard } from "@koloda/ai";
import { deepMerge } from "@koloda/app";
import type { DeepPartial } from "@koloda/app";
import { DEFAULT_TEMPLATE } from "@koloda/srs";
import type { Template } from "@koloda/srs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const DEFAULT_DATE = new Date("2024-01-01T00:00:00.000Z");
const DEFAULT_AI_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440000";

export function createQueryClient() {
  // A fresh client per test keeps query and mutation state from leaking across hook runs.
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

export function createQueryClientWrapper(queryClient = createQueryClient()) {
  return function QueryClientWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

export function createTemplate(overrides: DeepPartial<Template> = {}): Template {
  const base: Template = {
    id: 1,
    title: DEFAULT_TEMPLATE.title,
    content: structuredClone(DEFAULT_TEMPLATE.content),
    isLocked: false,
    createdAt: DEFAULT_DATE,
    updatedAt: null,
  };

  return deepMerge(base, overrides) as Template;
}

export function createGeneratedCard(overrides: DeepPartial<GeneratedCard> = {}): GeneratedCard {
  const base: GeneratedCard = {
    content: {
      "1": { text: "Front" },
      "2": { text: "Back" },
    },
  };

  return deepMerge(base, overrides) as GeneratedCard;
}

export function createAIProfile(overrides: DeepPartial<AIProfile> = {}): AIProfile {
  const base: AIProfile = {
    id: DEFAULT_AI_PROFILE_ID,
    title: "OpenRouter",
    // WHY: Public profile shape — usable keys stay out of React Query / shared UI.
    secrets: {
      provider: "openrouter" as const,
      apiKey: null,
    },
    hasSecrets: true,
    createdAt: DEFAULT_DATE.toISOString(),
  };

  return deepMerge(base, overrides) as AIProfile;
}

export function createAIModel(overrides: DeepPartial<AIModel> = {}): AIModel {
  const base: AIModel = {
    id: "openrouter/gpt-5-mini",
    name: "GPT-5 Mini",
    context_length: 128_000,
  };

  return deepMerge(base, overrides) as AIModel;
}
