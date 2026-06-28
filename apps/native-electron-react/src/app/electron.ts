import { AppError, type ErrorCode } from "@koloda/app";
import { fromWire, toWire } from "./ipc";

declare global {
  interface Window {
    electronAPI: {
      invoke: <T>(cmd: string, args?: unknown) => Promise<T>;
      on: (channel: string, callback: (...args: unknown[]) => void) => void;
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

function parseElectronError(error: unknown): ConstructorParameters<typeof AppError> {
  console.error("[Electron Error]", {
    error,
    type: typeof error,
    constructor: error?.constructor?.name,
    keys: error && typeof error === "object" ? Object.keys(error) : null,
    stringified: error && typeof error === "object" ? JSON.stringify(error) : null,
  });

  if (error && typeof error === "object") {
    const err = error as { code?: string; details?: string; message?: string };
    if (err.code && typeof err.code === "string") return [err.code as ErrorCode, err.details];
  }

  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.code) return [parsed.code as ErrorCode, parsed.details];
    } catch {
      return ["unknown", error.message];
    }
  }

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

export async function invoke<T>(cmd: string, args?: unknown): Promise<T> {
  try {
    const wire = args === undefined ? args : toWire(args);
    const raw = await window.electronAPI.invoke<unknown>(cmd, wire);
    return fromWire<T>(raw);
  } catch (error) {
    throw new AppError(...parseElectronError(error));
  }
}
