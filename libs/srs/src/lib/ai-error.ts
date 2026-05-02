import { isAIError } from "@koloda/ai";
import { AppError, ERROR_MESSAGES, isAbortError, isAppError } from "@koloda/app";
import type { ErrorCode } from "@koloda/app";
import { getObjectProperty } from "@koloda/app";
import type { I18nContext } from "@lingui/react";

export function getGenerateErrorMessage(error: Error | null, _: I18nContext["_"]) {
  if (!error) return null;

  if (isAppError(error)) {
    if (error.code === "unknown" && error.details) return error.details;

    const content = getAIHttpErrorMessageDescriptor(error.code)
      ?? ERROR_MESSAGES[error.code]
      ?? ERROR_MESSAGES.unknown;
    return typeof content === "function"
      ? _(content(error))
      : _(content);
  } else {
    return error.message;
  }
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
  if (isAIError(error)) {
    return new AppError(error.code as AppError["code"], error.message);
  }
  if (isAbortError(error)) throw error;

  const status = getHttpStatus(error);
  if (status !== null) {
    return new AppError(getAIHttpErrorCode(status), getErrorDetails(error));
  }

  if (isInvalidResponseError(error)) return new AppError("ai.invalid-response", getErrorDetails(error));
  if (isNetworkError(error)) return new AppError("ai.network", getErrorDetails(error));
  return new AppError("unknown", getErrorDetails(error));
}

function getAIHttpErrorCode(status: number): AppError["code"] {
  return `ai.http.${status}` as AppError["code"];
}

function getHttpStatus(error: unknown, visited = new Set<object>()): number | null {
  if (!error || typeof error !== "object") return null;
  if (visited.has(error)) return null;
  visited.add(error);

  const directStatus = getObjectProperty(error, "status");
  if (typeof directStatus === "number") return directStatus;

  const directStatusCode = getObjectProperty(error, "statusCode");
  if (typeof directStatusCode === "number") return directStatusCode;

  const nestedCause = getObjectProperty(error, "cause");
  const causeStatus = getHttpStatus(nestedCause, visited);
  if (causeStatus !== null) return causeStatus;

  const nestedData = getObjectProperty(error, "data");
  const dataStatus = getHttpStatus(nestedData, visited);
  if (dataStatus !== null) return dataStatus;

  for (const value of Object.values(error as Record<string, unknown>)) {
    const nestedStatus = getHttpStatus(value, visited);
    if (nestedStatus !== null) return nestedStatus;
  }

  return null;
}

function getErrorDetails(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return undefined;

  const responseBody = getObjectProperty(error, "responseBody");
  if (typeof responseBody === "string") return responseBody;

  const cause = getObjectProperty(error, "cause");
  if (cause instanceof Error) return cause.message;

  return undefined;
}

function isNetworkError(error: unknown) {
  return error instanceof TypeError;
}

function isInvalidResponseError(error: unknown) {
  return error instanceof SyntaxError;
}
