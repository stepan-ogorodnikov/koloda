import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod/v4";
import { selectAlgorithmSchema } from "./algorithms";
import { selectTemplateSchema } from "./templates";

export const learningSettingsMessages: Record<string, MessageDescriptor> = {
  "daily-limits.untouched-more-than-total": msg`daily-limits.untouched-more-than-total`,
  "daily-limits.learn-more-than-total": msg`daily-limits.learn-more-than-total`,
  "daily-limits.review-more-than-total": msg`daily-limits.review-more-than-total`,
};

const dailyLimits = z.object({
  total: z.number().min(0).default(200),
  untouched: z.number().min(0).default(50),
  learn: z.number().min(0).default(200),
  review: z.number().min(0).default(200),
}).refine(({ total, untouched }) => ((total > 0) && (untouched <= total)), {
  message: "daily-limits.untouched-more-than-total",
}).refine(({ total, learn }) => ((total > 0) && (learn <= total)), {
  message: "daily-limits.learn-more-than-total",
}).refine(({ total, review }) => ((total > 0) && (review <= total)), {
  message: "daily-limits.review-more-than-total",
});

export const learningSettingsValidation = z.object({
  dayStartsAt: z.iso.time({ precision: -1 }).default("05:00"),
  dailyLimits,
  defaults: z.object({
    algorithm: selectAlgorithmSchema.shape.id,
    template: selectTemplateSchema.shape.id,
  }),
});

export type LearningSettings = z.input<typeof learningSettingsValidation>;

export const DEFAULT_LEARNING_SETTINGS = { dailyLimits: {} };
