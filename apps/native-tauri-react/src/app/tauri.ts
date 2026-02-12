import { AppError, type ErrorCode } from "@koloda/srs";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { InvokeArgs } from "@tauri-apps/api/core";

/**
 * Parses error from tauri and converts to familiar format
 * Logs error to the console
 * @return Args ready to be consumed by AppError constructor
 */
function parseTauriError(error: unknown): ConstructorParameters<typeof AppError> {
  console.error("[Tauri Error]", {
    error,
    type: typeof error,
    constructor: error?.constructor?.name,
    keys: error && typeof error === "object" ? Object.keys(error) : null,
    stringified: error && typeof error === "object" ? JSON.stringify(error) : null,
  });

  // if it's already an object with a code, use it directly
  if (error && typeof error === "object") {
    const err = error as { code?: string; details?: string; message?: string };
    if (err.code && typeof err.code === "string") return [err.code as ErrorCode, err.details];
  }

  // if it's an Error object, try to parse its message as JSON
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.code) return [parsed.code as ErrorCode, parsed.details];
    } catch {
      return ["unknown", error.message];
    }
  }

  // if it's a string, try to parse it as JSON
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error);
      if (parsed.code) return [parsed.code as ErrorCode, parsed.details];
    } catch {
      return ["unknown", error];
    }
  }

  return ["unknown", error instanceof Error ? error.message : String(error)];
}

/**
 * Wraps tauri invoke with error handling
 * @returns The result of tauri invoke command
 * @throws {AppError} Any error from tauri side
 */
export async function invoke<T>(cmd: string, args?: InvokeArgs) {
  try {
    return await tauriInvoke<T>(cmd, args);
  } catch (error) {
    throw new AppError(...parseTauriError(error));
  }
}
