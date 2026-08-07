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

const MAX_ERROR_BODY = 800;

function truncate(text: string, max = MAX_ERROR_BODY): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/** Prefer provider response bodies over bare status text (e.g. "Forbidden"). */
export async function throwForAIResponse(response: Response): Promise<Response> {
  if (response.ok) return response;
  const code = getAIHttpErrorCode(response.status);
  const statusLabel = `${response.status} ${response.statusText}`.trim();
  let body = "";
  try {
    body = (await response.text()).trim();
  } catch {
    body = "";
  }
  throw new AIError(code, body ? `${statusLabel} — ${truncate(body)}` : statusLabel);
}

export function toAIError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof DOMException && error.name === "AbortError") throw error;

  const status = getHttpStatus(error);
  if (status !== null) {
    const code = getAIHttpErrorCode(status);
    return new AIError(code, getErrorDetails(error) ?? String(status));
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

  return null;
}

/**
 * Builds a human-readable detail string from AI SDK / fetch failures.
 * WHY: `APICallError.message` is often just statusText ("Forbidden"); the useful
 * provider JSON lives on `responseBody` / `data` / `url`.
 */
export function getErrorDetails(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return undefined;

  const record = error as Record<string, unknown>;
  const parts: string[] = [];

  const status =
    typeof record.statusCode === "number"
      ? record.statusCode
      : typeof record.status === "number"
        ? record.status
        : null;
  const message = error instanceof Error ? error.message : undefined;

  if (status != null && message) parts.push(`${status} ${message}`);
  else if (message) parts.push(message);
  else if (status != null) parts.push(String(status));

  const responseBody = record.responseBody;
  if (typeof responseBody === "string" && responseBody.trim()) {
    parts.push(truncate(responseBody.trim()));
  } else if (record.data !== undefined) {
    try {
      const serialized = typeof record.data === "string" ? record.data : JSON.stringify(record.data);
      if (serialized) parts.push(truncate(serialized));
    } catch {}
  }

  if (typeof record.url === "string" && record.url) {
    parts.push(`url=${record.url}`);
  }

  if (parts.length > 0) return parts.join(" — ");

  const cause = record.cause;
  if (cause instanceof Error) return cause.message;

  return undefined;
}
