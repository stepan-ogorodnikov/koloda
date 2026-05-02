import type { AIModel, AIProfile, GeneratedCard } from "@koloda/ai";
import { deepMerge } from "@koloda/app";
import type { DeepPartial } from "@koloda/app";
import {
  convertTemplateToLessonTemplate,
  DEFAULT_FSRS_ALGORITHM,
  DEFAULT_LEARNING_SETTINGS,
  DEFAULT_TEMPLATE,
} from "@koloda/srs";
import type { Algorithm, Card, Deck, Lesson, LessonData, LessonType, Template, TodaysReviewTotals } from "@koloda/srs";
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

export function createAlgorithm(overrides: DeepPartial<Algorithm> = {}): Algorithm {
  const base: Algorithm = {
    id: 1,
    title: "Default FSRS",
    content: DEFAULT_FSRS_ALGORITHM,
    createdAt: DEFAULT_DATE,
    updatedAt: null,
  };

  return deepMerge(base, overrides) as Algorithm;
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

export function createDeck(overrides: DeepPartial<Deck> = {}): Deck {
  const base: Deck = {
    id: 1,
    title: "Default Deck",
    algorithmId: 1,
    templateId: 1,
    createdAt: DEFAULT_DATE,
    updatedAt: null,
  };

  return deepMerge(base, overrides) as Deck;
}

export function createCard(overrides: DeepPartial<Card> = {}): Card {
  const base: Card = {
    id: 1,
    deckId: 1,
    templateId: 1,
    content: {
      "1": { text: "Question" },
      "2": { text: "Answer" },
    },
    state: 0,
    dueAt: null,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
    createdAt: DEFAULT_DATE,
    updatedAt: null,
  };

  return deepMerge(base, overrides) as Card;
}

export function createLesson(overrides: DeepPartial<Lesson> = {}): Lesson {
  const base: Lesson = {
    id: null,
    title: "All Decks",
    untouched: 0,
    learn: 0,
    review: 0,
    total: 0,
  };

  return deepMerge(base, overrides) as Lesson;
}

export function createLessonData(overrides: DeepPartial<LessonData> = {}): LessonData {
  const template = createTemplate();
  const deck = createDeck({ templateId: template.id });
  const algorithm = createAlgorithm({ id: deck.algorithmId });
  const card = createCard({ deckId: deck.id, templateId: template.id });

  const base: LessonData = {
    cards: [card],
    decks: [deck],
    templates: [convertTemplateToLessonTemplate(template)],
    algorithms: [algorithm],
  };

  return deepMerge(base, overrides) as LessonData;
}

export function createTodaysReviewTotals(options?: {
  dailyLimits?: DeepPartial<TodaysReviewTotals["dailyLimits"]>;
  reviewTotals?: Partial<Record<LessonType, number>>;
}): TodaysReviewTotals {
  const dailyLimits = deepMerge(
    structuredClone(DEFAULT_LEARNING_SETTINGS.dailyLimits),
    options?.dailyLimits ?? {},
  ) as TodaysReviewTotals["dailyLimits"];
  const rawReviewTotals = {
    untouched: 0,
    learn: 0,
    review: 0,
    total: 0,
    ...options?.reviewTotals,
  };
  const total = (dailyLimits.untouched.counts ? rawReviewTotals.untouched : 0)
    + (dailyLimits.learn.counts ? rawReviewTotals.learn : 0)
    + (dailyLimits.review.counts ? rawReviewTotals.review : 0);

  return {
    dailyLimits,
    reviewTotals: { ...rawReviewTotals, total },
    meta: {
      isUntouchedOverTheLimit: false,
      isLearnOverTheLimit: false,
      isReviewOverTheLimit: false,
      isTotalOverTheLimit: false,
    },
  };
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
    secrets: {
      provider: "openrouter" as const,
      apiKey: "test-key",
    },
    lastUsedModel: "openrouter/gpt-5-mini",
    createdAt: DEFAULT_DATE.toISOString(),
    lastUsedAt: DEFAULT_DATE.toISOString(),
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
