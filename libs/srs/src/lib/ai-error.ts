import type { I18nContext } from "@lingui/react";
import { AppError, ERROR_MESSAGES, isAbortError, isAppError } from "./error";
import type { ErrorCode } from "./error";
import { getObjectProperty } from "./utility";

export function getGenerateErrorMessage(error: Error | null, _: I18nContext["_"]) {
  if (!error) return null;

  if (isAppError(error)) {
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

export function getAIHttpErrorCode(status: number): AppError["code"] {
  return `ai.http.${status}` as AppError["code"];
}

export function throwForAIResponse(response: Response): Response {
  if (response.ok) return response;

  const code = getAIHttpErrorCode(response.status);
  throw new AppError(code, `${response.status} ${response.statusText}`.trim());
}

export function toAIAppError(error: unknown): Error {
  if (error instanceof AppError) return error;
  if (isAbortError(error)) throw error;

  const status = getHttpStatus(error);
  if (status !== null) {
    const code = getAIHttpErrorCode(status);
    return new AppError(code, getErrorDetails(error));
  }

  if (isInvalidResponseError(error)) return new AppError("ai.invalid-response", getErrorDetails(error));
  if (isNetworkError(error)) return new AppError("ai.network", getErrorDetails(error));
  return new AppError("unknown", getErrorDetails(error));
}

export async function wrapAIError<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error) => {
    throw toAIAppError(error);
  });
}
