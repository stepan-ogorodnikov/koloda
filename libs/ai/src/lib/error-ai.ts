// Bridge from AIError to the shared AppError table: classification via
// `toAIError`, then wrap/format for display. Renderer-only.
//
// WHY: exported via the `./app-error` subpath, not the root barrel. The main
// process imports the root (`ai-ipc.ts`, bundled by `bundle-main.ts`), and this
// module pulls `@koloda/app` whose `error.ts` uses `@lingui/core/macro` — a
// compile-time macro with no runtime export outside the vite/vitest plugins.
// Re-exporting it from the root would crash main at startup.
import { AppError, ERROR_MESSAGES, formatAppError, getAIHttpErrorMessageDescriptor } from "@koloda/app";
import { toAIError } from "./error";
import type { ErrorCode } from "@koloda/app";
import type { I18nContext } from "@lingui/react";

export type FormattedError = { message: string; details?: string };

export function formatGenerateError(
  error: Error | { message: string; details?: string } | null | undefined,
  _: I18nContext["_"],
): FormattedError | null {
  if (!error) return null;
  return formatAppError(toGenerateAppError(error), _, ERROR_MESSAGES.unknown);
}

function toGenerateAppError(error: Error | { message: string; details?: string }): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) return toAIAppError(error) as AppError;

  const code = error.message;
  const isKnownCode = Boolean(getAIHttpErrorMessageDescriptor(code) ?? ERROR_MESSAGES[code as ErrorCode]);
  if (isKnownCode) return new AppError(code as ErrorCode, error.details);
  return new AppError("unknown", error.details ?? error.message);
}

export function toAIAppError(error: unknown): Error {
  if (error instanceof AppError) return error;
  const aiError = toAIError(error);

  return new AppError(aiError.code as AppError["code"], aiError.message === aiError.code ? undefined : aiError.message);
}
