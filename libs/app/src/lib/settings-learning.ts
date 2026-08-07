import { z } from "zod";
import { AppError } from "./error";

// WHY: regex enforces zero-padded "hh:mm". `z.iso.time({ precision: -1 })`
// accepted "5:00" and broke the TS↔Rust mirror — Rust's `parse_day_starts_at`
// rejects it. Do not loosen to `\d{1,2}`.
const DAY_STARTS_AT_PATTERN = /^(\d{2}):(\d{2})$/;

// INVARIANT: on success, returns `{ hours, minutes }` with `0 <= hours <= 23`
// and `0 <= minutes <= 59`. Callers (e.g. `getCurrentLearningDayRange`) rely
// on this without re-validating. Mirrors Rust `parse_day_starts_at`.
export function parseDayStartsAt(dayStartsAt: string) {
  const match = dayStartsAt.match(DAY_STARTS_AT_PATTERN);
  if (!match) throw new AppError("validation.settings-learning.day-starts-at");

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);

  if (hours > 23 || minutes > 59) throw new AppError("validation.settings-learning.day-starts-at");

  return { hours, minutes };
}

export const dayStartsAtValidation = z.string().refine(
  (value) => {
    try {
      parseDayStartsAt(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "validation.settings-learning.day-starts-at" },
);

export const LEARNING_DAILY_LIMIT_TYPES = ["untouched", "learn", "review"] as const;

export type LearningDailyLimitType = (typeof LEARNING_DAILY_LIMIT_TYPES)[number];

export const learningDailyLimitValidation = z.object({
  value: z.number().min(0),
  counts: z.boolean(),
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

export const resolvedDailyLimitsValidation = z
  .object({
    total: z.number().min(0),
    untouched: learningDailyLimitValidation,
    learn: learningDailyLimitValidation,
    review: learningDailyLimitValidation,
  })
  .refine(({ total, untouched }) => total === 0 || !untouched.counts || untouched.value <= total, {
    message: "validation.settings-learning.daily-limits.untouched-exceeds-total",
  })
  .refine(({ total, learn }) => total === 0 || !learn.counts || learn.value <= total, {
    message: "validation.settings-learning.daily-limits.learn-exceeds-total",
  })
  .refine(({ total, review }) => total === 0 || !review.counts || review.value <= total, {
    message: "validation.settings-learning.daily-limits.review-exceeds-total",
  });

const dailyLimitsValidation = z
  .object({
    total: z.number().min(0).default(200),
    untouched: createLearningDailyLimitValidation(50, true),
    learn: createLearningDailyLimitValidation(0, false),
    review: createLearningDailyLimitValidation(200, true),
  })
  .refine(({ total, untouched }) => total === 0 || !untouched.counts || untouched.value <= total, {
    message: "validation.settings-learning.daily-limits.untouched-exceeds-total",
  })
  .refine(({ total, learn }) => total === 0 || !learn.counts || learn.value <= total, {
    message: "validation.settings-learning.daily-limits.learn-exceeds-total",
  })
  .refine(({ total, review }) => total === 0 || !review.counts || review.value <= total, {
    message: "validation.settings-learning.daily-limits.review-exceeds-total",
  });

export const learningSettingsValidation = z.object({
  defaults: z.object({
    algorithm: z.int(),
    template: z.int(),
  }),
  dailyLimits: dailyLimitsValidation,
  dayStartsAt: dayStartsAtValidation.default("05:00"),
  learnAheadLimit: z.tuple([z.number().min(0).max(48), z.number().min(0).max(59)]).default([0, 30]),
});

export const resolvedLearningSettingsValidation = z.object({
  defaults: z.object({
    algorithm: z.int(),
    template: z.int(),
  }),
  dailyLimits: resolvedDailyLimitsValidation,
  dayStartsAt: dayStartsAtValidation,
  learnAheadLimit: z.tuple([z.number().min(0).max(48), z.number().min(0).max(59)]),
});

export type LearningSettingsInput = z.input<typeof learningSettingsValidation>;
export type LearningSettings = LearningSettingsInput;
export type ResolvedLearningSettings = z.output<typeof resolvedLearningSettingsValidation>;

export const DEFAULT_LEARNING_SETTINGS: ResolvedLearningSettings = learningSettingsValidation.parse({
  defaults: { algorithm: 0, template: 0 },
  dailyLimits: {},
});
