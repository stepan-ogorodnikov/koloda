import { msg, plural } from "@lingui/core/macro";
import type { StandardSchemaV1Issue } from "@tanstack/react-form";
import { ZodError } from "zod";

export type ZodIssue = ZodError["issues"][number];
export type FormError = StandardSchemaV1Issue | ZodIssue;

export const ERROR_MESSAGES = {
  "unknown": msg`unknown`,
  "ai.http": ({ status }: any) => msg`ai.http ${status}`,
  "ai.network": msg`ai.network`,
  "ai.invalid-response": msg`ai.invalid-response`,
  "ai.http.400": msg`ai.http.400`,
  "ai.http.401": msg`ai.http.401`,
  "ai.http.402": msg`ai.http.402`,
  "ai.http.403": msg`ai.http.403`,
  "ai.http.404": msg`ai.http.404`,
  "ai.http.408": msg`ai.http.408`,
  "ai.http.413": msg`ai.http.413`,
  "ai.http.422": msg`ai.http.422`,
  "ai.http.429": msg`ai.http.429`,
  "ai.http.500": msg`ai.http.500`,
  "ai.http.502": msg`ai.http.502`,
  "ai.http.503": msg`ai.http.503`,
  "ai.http.504": msg`ai.http.504`,
  "db.get": msg`db.get`,
  "db.add": msg`db.add`,
  "db.update": msg`db.update`,
  "db.delete": msg`db.delete`,
  "db.clone": msg`db.clone`,
  "not-found.algorithms.clone.source": msg`not-found.algorithms.clone.source`,
  "not-found.algorithms.delete.successor": msg`not-found.algorithms.delete.successor`,
  "not-found.templates.clone.source": msg`not-found.templates.clone.source`,
  "not-found.cards.add.template": msg`not-found.cards.add.template`,
  "not-found.cards.update.card": msg`not-found.cards.update.card`,
  "not-found.cards.update.template": msg`not-found.cards.update.template`,
  "validation.common.title.too-short": msg`validation.common.title.too-short`,
  "validation.common.title.too-long": ({ maximum }: any) =>
    msg`${plural(maximum, { other: "validation.common.title.too-long" })}`,
  "validation.settings-learning.daily-limits.untouched-exceeds-total":
    msg`validation.settings-learning.daily-limits.untouched-exceeds-total`,
  "validation.settings-learning.daily-limits.learn-exceeds-total":
    msg`validation.settings-learning.daily-limits.learn-exceeds-total`,
  "validation.settings-learning.daily-limits.review-exceeds-total":
    msg`validation.settings-learning.daily-limits.review-exceeds-total`,
  "validation.settings-learning.learn-ahead-limit.hours-range":
    msg`validation.settings-learning.learn-ahead-limit.hours-range`,
  "validation.settings-learning.learn-ahead-limit.minutes-range":
    msg`validation.settings-learning.learn-ahead-limit.minutes-range`,
  "validation.settings-learning.day-starts-at": msg`validation.settings-learning.day-starts-at`,
  "validation.lessons.result.card-review-mismatch": msg`validation.lessons.result.card-review-mismatch`,
  "validation.settings-hotkeys.duplicate-keys": msg`validation.settings-hotkeys.duplicate-keys`,
  "validation.settings-ai.providers.apiKey": msg`validation.settings-ai.providers.apiKey`,
  "validation.settings-ai.providers.baseUrl": msg`validation.settings-ai.providers.baseUrl`,
  "validation.templates.fields.too-few": msg`validation.templates.fields.too-few`,
  "validation.templates.layout.too-few": msg`validation.templates.layout.too-few`,
  "validation.templates.update-locked": msg`validation.templates.update-locked`,
  "validation.templates.delete-locked": msg`validation.templates.delete-locked`,
  "validation.cards.content.field-empty": msg`validation.cards.content.field-empty`,
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export class AppError extends Error {
  code: ErrorCode;
  details?: string;

  constructor(code: ErrorCode, details?: string) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.details = details;

    if (Error.captureStackTrace) Error.captureStackTrace(this, AppError);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Wraps an async function to ensure that ui gets known translated error message if any
 * @param code - The error code to use if the function throws
 * @param fn - The async function to execute
 * @returns The result of the function
 * @throws {ZodError} Validation errors go through
 * @throws {AppError} Other errors are converted to AppError with error code provided
 */
export async function throwKnownError<T>(code: ErrorCode, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ZodError) throw e;
    throw new AppError(code, e instanceof Error ? e.message : undefined);
  }
}

/**
 * Converts errors to be consumed by form errors component
 * ZodErrors are converted to a Record with indexed keys
 * AppError is converted to a single entry
 * Other errors are converted to a single entry with a fallback code
 * @param error - The error object
 * @returns A record mapping field indices to arrays of validation issues
 */
export function toFormErrors(error: unknown): Record<string, StandardSchemaV1Issue[]> {
  if (error instanceof ZodError) {
    return error.issues.reduce<Record<string, StandardSchemaV1Issue[]>>((acc, issue, index) => {
      const key = index.toString();
      acc[key] = [{ ...issue, message: issue.message, path: issue.path.map(String) }];
      return acc;
    }, {});
  }

  const message = isAppError(error) ? error.code : "unknown";
  return {
    "0": [{ message, path: ["0"] }],
  };
}
