import { z } from "zod";

export const LEARNING_DAILY_LIMIT_TYPES = ["untouched", "learn", "review"] as const;

export type LearningDailyLimitType = typeof LEARNING_DAILY_LIMIT_TYPES[number];

export const learningDailyLimitValidation = z.object({
  value: z.number().min(0),
  counts: z.boolean(), // Indicates if value is included when calculating total
});

function createLearningDailyLimitValidation(defaultValue: number, defaultCounts: boolean) {
  return z.preprocess(
    (value) => {
      if (typeof value === "number") return { value, counts: true };
      return value ?? {};
    },
    learningDailyLimitValidation.extend({
      value: z.number().min(0).default(defaultValue),
      counts: z.boolean().default(defaultCounts),
    }),
  );
}

export const resolvedDailyLimitsValidation = z.object({
  total: z.number().min(0),
  untouched: learningDailyLimitValidation,
  learn: learningDailyLimitValidation,
  review: learningDailyLimitValidation,
}).refine(({ total, untouched }) => ((total === 0) || !untouched.counts || (untouched.value <= total)), {
  message: "validation.settings-learning.daily-limits.untouched-exceeds-total",
}).refine(({ total, learn }) => ((total === 0) || !learn.counts || (learn.value <= total)), {
  message: "validation.settings-learning.daily-limits.learn-exceeds-total",
}).refine(({ total, review }) => ((total === 0) || !review.counts || (review.value <= total)), {
  message: "validation.settings-learning.daily-limits.review-exceeds-total",
});

const dailyLimitsValidation = z.object({
  total: z.number().min(0).default(200),
  untouched: createLearningDailyLimitValidation(50, true),
  learn: createLearningDailyLimitValidation(0, false),
  review: createLearningDailyLimitValidation(200, true),
}).refine(({ total, untouched }) => ((total === 0) || !untouched.counts || (untouched.value <= total)), {
  message: "validation.settings-learning.daily-limits.untouched-exceeds-total",
}).refine(({ total, learn }) => ((total === 0) || !learn.counts || (learn.value <= total)), {
  message: "validation.settings-learning.daily-limits.learn-exceeds-total",
}).refine(({ total, review }) => ((total === 0) || !review.counts || (review.value <= total)), {
  message: "validation.settings-learning.daily-limits.review-exceeds-total",
});

export const learningSettingsValidation = z.object({
  defaults: z.object({
    algorithm: z.int(),
    template: z.int(),
  }),
  dailyLimits: dailyLimitsValidation,
  dayStartsAt: z.iso.time({ precision: -1 }).default("05:00"),
  learnAheadLimit: z.tuple([z.number().min(0).max(48), z.number().min(0).max(59)]).default([0, 30]),
});

export const resolvedLearningSettingsValidation = z.object({
  defaults: z.object({
    algorithm: z.int(),
    template: z.int(),
  }),
  dailyLimits: resolvedDailyLimitsValidation,
  dayStartsAt: z.iso.time({ precision: -1 }),
  learnAheadLimit: z.tuple([z.number().min(0).max(48), z.number().min(0).max(59)]),
});

export type LearningSettingsInput = z.input<typeof learningSettingsValidation>;
export type LearningSettings = LearningSettingsInput;
export type ResolvedLearningSettings = z.output<typeof resolvedLearningSettingsValidation>;

export const DEFAULT_LEARNING_SETTINGS: ResolvedLearningSettings = learningSettingsValidation.parse({
  defaults: { algorithm: 0, template: 0 },
  dailyLimits: {},
});
