import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod";
import { algorithmValidation } from "./algorithms";
import { templateValidation } from "./templates";

export const learningSettingsMessages: Record<string, MessageDescriptor> = {
  "validation.settings-learning.daily-limits.untouched-exceeds-total": msg`validation.settings-learning.daily-limits.untouched-exceeds-total`,
  "validation.settings-learning.daily-limits.learn-exceeds-total": msg`validation.settings-learning.daily-limits.learn-exceeds-total`,
  "validation.settings-learning.daily-limits.review-exceeds-total": msg`validation.settings-learning.daily-limits.review-exceeds-total`,
  "validation.settings-learning.learn-ahead-limit.hours-range": msg`validation.settings-learning.learn-ahead-limit.hours-range`,
  "validation.settings-learning.learn-ahead-limit.minutes-range": msg`validation.settings-learning.learn-ahead-limit.minutes-range`,
};

const dailyLimits = z.object({
  total: z.number().min(0).default(200),
  untouched: z.number().min(0).default(50),
  learn: z.number().min(0).default(200),
  review: z.number().min(0).default(200),
}).refine(({ total, untouched }) => ((total > 0) && (untouched <= total)), {
  message: "validation.settings-learning.daily-limits.untouched-exceeds-total",
}).refine(({ total, learn }) => ((total > 0) && (learn <= total)), {
  message: "validation.settings-learning.daily-limits.learn-exceeds-total",
}).refine(({ total, review }) => ((total > 0) && (review <= total)), {
  message: "validation.settings-learning.daily-limits.review-exceeds-total",
});

export const learningSettingsValidation = z.object({
  defaults: z.object({
    algorithm: algorithmValidation.shape.id,
    template: templateValidation.shape.id,
  }),
  dailyLimits,
  dayStartsAt: z.iso.time({ precision: -1 }).default("05:00"),
  learnAheadLimit: z.tuple([z.number().min(0).max(48), z.number().min(0).max(59)]).default([0, 30]),
});

export type LearningSettings = z.input<typeof learningSettingsValidation>;

export const DEFAULT_LEARNING_SETTINGS = { dailyLimits: {} };
