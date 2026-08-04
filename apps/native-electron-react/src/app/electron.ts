import { AppError } from "@koloda/app";
import type { ErrorCode } from "@koloda/app";
import { fromWire, toWire } from "./ipc";

declare global {
  interface Window {
    electronAPI: {
      invoke: <T>(cmd: string, args?: unknown) => Promise<T>;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
      getZoomFactor: () => number;
      getZoomLevel: () => number;
      onZoomFactorChanged: (callback: (zoomFactor: number) => void) => () => void;
      zoomIn: () => void;
      zoomOut: () => void;
      zoomReset: () => void;
      setZoomLevel: (level: number) => void;
    };
  }
}

function parseErrorPayload(message: string): { code: string; details?: string } | null {
  const start = message.indexOf("{");
  const end = message.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(message.slice(start, end + 1)) as { code?: unknown; details?: unknown };
    if (typeof parsed.code !== "string" || !parsed.code) return null;
    return {
      code: parsed.code,
      details: typeof parsed.details === "string" ? parsed.details : undefined,
    };
  } catch {
    return null;
  }
}

function parseElectronError(error: unknown): ConstructorParameters<typeof AppError> {
  // WHY: Prefer structured `{ code, details }` from our throwIpcError JSON over
  // Electron/Node `error.code` (e.g. ERR_*) which would hide the real payload.
  if (error instanceof Error) {
    const fromMessage = parseErrorPayload(error.message);
    if (fromMessage) return [fromMessage.code as ErrorCode, fromMessage.details];
  }

  if (typeof error === "string") {
    const fromString = parseErrorPayload(error);
    if (fromString) return [fromString.code as ErrorCode, fromString.details];
    return ["unknown", error];
  }

  if (error && typeof error === "object") {
    const err = error as { code?: string; details?: string; message?: string };
    if (typeof err.message === "string") {
      const fromNested = parseErrorPayload(err.message);
      if (fromNested) return [fromNested.code as ErrorCode, fromNested.details];
    }
    if (err.code && typeof err.code === "string") return [err.code as ErrorCode, err.details];
  }

  return ["unknown", error instanceof Error ? error.message : String(error)];
}

export async function invoke<T>(cmd: string, args?: unknown): Promise<T> {
  try {
    const wire = args === undefined ? args : toWire(args);
    const raw = await window.electronAPI.invoke<unknown>(cmd, wire);
    return fromWire<T>(raw);
  } catch (error) {
    throw new AppError(...parseElectronError(error));
  }
}
