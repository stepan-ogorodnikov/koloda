export class AIError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AIError";
  }
}

export function isAIError(error: unknown): error is AIError {
  return error instanceof AIError;
}

export function getAIHttpErrorCode(status: number): string {
  return `ai.http.${status}`;
}

export function throwForAIResponse(response: Response): Response {
  if (response.ok) return response;
  const code = getAIHttpErrorCode(response.status);
  throw new AIError(code, `${response.status} ${response.statusText}`.trim());
}

export function toAIError(error: unknown): Error {
  if (error instanceof AIError) return error;
  if (error instanceof DOMException && error.name === "AbortError") throw error;

  const status = getHttpStatus(error);
  if (status !== null) {
    const code = getAIHttpErrorCode(status);
    return new AIError(code, getErrorDetails(error));
  }

  if (error instanceof SyntaxError) return new AIError("ai.invalid-response", getErrorDetails(error));
  if (error instanceof TypeError) return new AIError("ai.network", getErrorDetails(error));
  return new AIError("unknown", getErrorDetails(error));
}

export async function wrapAIError<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error) => {
    throw toAIError(error);
  });
}

function getHttpStatus(error: unknown, visited = new Set<object>()): number | null {
  if (!error || typeof error !== "object") return null;
  if (visited.has(error)) return null;
  visited.add(error);

  const directStatus = (error as Record<string, unknown>).status;
  if (typeof directStatus === "number") return directStatus;

  const directStatusCode = (error as Record<string, unknown>).statusCode;
  if (typeof directStatusCode === "number") return directStatusCode;

  const nestedCause = (error as Record<string, unknown>).cause;
  const causeStatus = getHttpStatus(nestedCause, visited);
  if (causeStatus !== null) return causeStatus;

  const nestedData = (error as Record<string, unknown>).data;
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

  const responseBody = (error as Record<string, unknown>).responseBody;
  if (typeof responseBody === "string") return responseBody;

  const cause = (error as Record<string, unknown>).cause;
  if (cause instanceof Error) return cause.message;

  return undefined;
}
