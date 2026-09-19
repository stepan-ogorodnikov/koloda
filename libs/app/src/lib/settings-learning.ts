import { z } from "zod";
import { AppError } from "./error";
import { SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID } from "./seed-ids";

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

export const dailyLimitCapValidation = z.number().min(0).nullable();

export const learningDailyLimitValidation = z.object({
  value: dailyLimitCapValidation,
  counts: z.boolean(),
});

function createLearningDailyLimitValidation(defaultValue: number, defaultCounts: boolean) {
  return z.preprocess(
    (value) => {
      if (typeof value === "number") return { value, counts: true };
      return value ?? {};
    },
    learningDailyLimitValidation.extend({
      value: dailyLimitCapValidation.default(defaultValue),
      counts: z.boolean().default(defaultCounts),
    }),
  );
}

type CountedDailyLimits = {
  total: number | null;
  untouched: { value: number | null; counts: boolean };
  learn: { value: number | null; counts: boolean };
  review: { value: number | null; counts: boolean };
};

export function remainingDailyLimitRoom(limit: number | null, used: number): number {
  if (limit == null) return Number.POSITIVE_INFINITY;
  return Math.max(limit - used, 0);
}

export function isFiniteDailyLimitOver(limit: number | null, used: number, mode: "own" | "total"): boolean {
  if (limit == null || used <= 0) return false;
  return mode === "total" ? used >= limit : used > limit;
}

export function isBucketOverDailyLimit(
  counted: boolean,
  bucket: number,
  bucketLimit: number | null,
  total: number,
  totalLimit: number | null,
): boolean {
  if (bucket <= 0) return false;
  return (
    isFiniteDailyLimitOver(bucketLimit, bucket, "own") ||
    (counted && isFiniteDailyLimitOver(totalLimit, total, "total"))
  );
}

function countedFitsTotal(total: number | null, limit: { value: number | null; counts: boolean }): boolean {
  if (total == null || !limit.counts || limit.value == null) return true;
  return limit.value <= total;
}

// WHY: the form validates the resolved schema, the save path re-validates the
// defaulting one — one shared chain so form-time and save-time acceptance
// cannot drift when a rule changes.
function withCountedLimitRefines<S extends z.ZodType<CountedDailyLimits>>(schema: S) {
  return schema
    .refine(({ total, untouched }) => countedFitsTotal(total, untouched), {
      message: "validation.settings-learning.daily-limits.untouched-exceeds-total",
    })
    .refine(({ total, learn }) => countedFitsTotal(total, learn), {
      message: "validation.settings-learning.daily-limits.learn-exceeds-total",
    })
    .refine(({ total, review }) => countedFitsTotal(total, review), {
      message: "validation.settings-learning.daily-limits.review-exceeds-total",
    });
}

export const resolvedDailyLimitsValidation = withCountedLimitRefines(
  z.object({
    total: dailyLimitCapValidation,
    untouched: learningDailyLimitValidation,
    learn: learningDailyLimitValidation,
    review: learningDailyLimitValidation,
  }),
);

const dailyLimitsValidation = withCountedLimitRefines(
  z.object({
    // WHY: stored Total 0 meant unlimited. The defaulting/input schema maps it to
    // null so get_settings still reads those rows as unlimited. Do not copy this
    // onto the resolved schema — form save of 0 is a hard cap.
    total: z.preprocess((value) => (value === 0 ? null : value), dailyLimitCapValidation.default(200)),
    untouched: createLearningDailyLimitValidation(50, true),
    learn: createLearningDailyLimitValidation(0, false),
    review: createLearningDailyLimitValidation(200, true),
  }),
);

export const learningSettingsValidation = z.object({
  defaults: z.object({
    algorithm: z.uuid(),
    template: z.uuid(),
  }),
  dailyLimits: dailyLimitsValidation,
  dayStartsAt: dayStartsAtValidation.default("05:00"),
  learnAheadLimit: z.tuple([z.number().min(0).max(48), z.number().min(0).max(59)]).default([0, 30]),
});

export const resolvedLearningSettingsValidation = z.object({
  defaults: z.object({
    algorithm: z.uuid(),
    template: z.uuid(),
  }),
  dailyLimits: resolvedDailyLimitsValidation,
  dayStartsAt: dayStartsAtValidation,
  learnAheadLimit: z.tuple([z.number().min(0).max(48), z.number().min(0).max(59)]),
});

export type LearningSettingsInput = z.input<typeof learningSettingsValidation>;
export type LearningSettings = LearningSettingsInput;
export type ResolvedLearningSettings = z.output<typeof resolvedLearningSettingsValidation>;

export const DEFAULT_LEARNING_SETTINGS: ResolvedLearningSettings = learningSettingsValidation.parse({
  defaults: { algorithm: SEED_ALGORITHM_SIMPLE_ID, template: SEED_TEMPLATE_TYPE_ID },
  dailyLimits: {},
});
