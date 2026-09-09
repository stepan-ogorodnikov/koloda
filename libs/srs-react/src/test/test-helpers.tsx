import { deepMerge, SEED_TEMPLATE_TYPE_BACK_FIELD_ID, SEED_TEMPLATE_TYPE_FRONT_FIELD_ID } from "@koloda/app";
import { DEFAULT_LEARNING_SETTINGS } from "@koloda/app";
import type { DeepPartial } from "@koloda/app";
import { convertTemplateToLessonTemplate, DEFAULT_FSRS_ALGORITHM, DEFAULT_TEMPLATE } from "@koloda/srs";
import type {
  Algorithm,
  Card,
  Deck,
  LessonData,
  LessonsResult,
  LessonType,
  Template,
  TodaysReviewTotals,
} from "@koloda/srs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const DEFAULT_DATE = new Date("2024-01-01T00:00:00.000Z");

export function testId(n: number): string {
  return `01900000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

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
    id: testId(1),
    title: "Default FSRS",
    content: DEFAULT_FSRS_ALGORITHM,
    createdAt: DEFAULT_DATE,
    updatedAt: null,
  };

  return deepMerge(base, overrides) as Algorithm;
}

export function createTemplate(overrides: DeepPartial<Template> = {}): Template {
  const base: Template = {
    id: testId(1),
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
    id: testId(1),
    title: "Default Deck",
    algorithmId: testId(1),
    templateId: testId(1),
    createdAt: DEFAULT_DATE,
    updatedAt: null,
  };

  return deepMerge(base, overrides) as Deck;
}

export function createCard(overrides: DeepPartial<Card> = {}): Card {
  const base: Card = {
    id: testId(1),
    deckId: testId(1),
    templateId: testId(1),
    content: {
      [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: "Question" },
      [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: "Answer" },
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

export function createLessonsResult(overrides: DeepPartial<LessonsResult> = {}): LessonsResult {
  const base: LessonsResult = {
    total: { untouched: 0, learn: 0, review: 0, total: 0 },
    decks: [],
  };

  return deepMerge(base, overrides) as LessonsResult;
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
  const total =
    (dailyLimits.untouched.counts ? rawReviewTotals.untouched : 0) +
    (dailyLimits.learn.counts ? rawReviewTotals.learn : 0) +
    (dailyLimits.review.counts ? rawReviewTotals.review : 0);

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
