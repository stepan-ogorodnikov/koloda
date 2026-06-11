import { toAIError } from "@koloda/ai";
import type { I18nContext } from "@lingui/react";
import { AppError, ERROR_MESSAGES } from "./error";
import type { ErrorCode } from "./error";

export function getGenerateErrorMessage(error: Error | null, _: I18nContext["_"]) {
  if (!error) return null;

  const appError = error instanceof AppError ? error : toAIAppError(error) as AppError;

  if (appError.code === "unknown" && appError.details) return appError.details;

  const content = getAIHttpErrorMessageDescriptor(appError.code)
    ?? ERROR_MESSAGES[appError.code]
    ?? ERROR_MESSAGES.unknown;
  return typeof content === "function"
    ? _(content(appError))
    : _(content);
}

export function getAIHttpErrorMessageDescriptor(code: string) {
  if (!code.startsWith("ai.http.")) return null;

  const directMessage = ERROR_MESSAGES[code as ErrorCode];
  if (directMessage) return directMessage;

  const status = Number(code.slice("ai.http.".length));
  return typeof status === "number" && !Number.isNaN(status)
    ? ERROR_MESSAGES["ai.http"]({ status })
    : ERROR_MESSAGES.unknown;
}

export function toAIAppError(error: unknown): Error {
  if (error instanceof AppError) return error;

  const aiError = toAIError(error);
  return new AppError(
    aiError.code as AppError["code"],
    aiError.message === aiError.code ? undefined : aiError.message,
  );
}
