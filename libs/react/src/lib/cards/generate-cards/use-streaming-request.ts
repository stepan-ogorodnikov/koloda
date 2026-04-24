import { isAbortError } from "@koloda/srs";
import { useCallback, useRef, useState } from "react";

export type StreamResult = "success" | "aborted" | "error";

export type StreamExecutor<TChunk, TRequest> = (
  request: TRequest,
  onChunk: (chunk: TChunk) => void,
  signal: AbortSignal,
) => Promise<void>;

export type UseStreamingRequestReturn<TData, TChunk, TRequest> = {
  data: TData;
  isRunning: boolean;
  error: Error | null;
  start: (request: TRequest, onChunk?: (chunk: TChunk) => void) => Promise<StreamResult>;
  cancel: () => void;
  reset: () => void;
};

export function useStreamingRequest<TData, TChunk, TRequest>(options: {
  initialData: TData;
  accumulate: (prev: TData, chunk: TChunk) => TData;
  executor: StreamExecutor<TChunk, TRequest>;
}): UseStreamingRequestReturn<TData, TChunk, TRequest> {
  const [data, setData] = useState<TData>(options.initialData);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (request: TRequest, onChunk?: (chunk: TChunk) => void) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setIsRunning(true);
      setError(null);
      setData(options.initialData);

      try {
        await options.executor(
          request,
          (chunk) => {
            if (!controller.signal.aborted) {
              setData((prev) => options.accumulate(prev, chunk));
              onChunk?.(chunk);
            }
          },
          controller.signal,
        );
        return "success" as const;
      } catch (e) {
        if (controller.signal.aborted || isAbortError(e)) {
          return "aborted" as const;
        }
        setError(e instanceof Error ? e : new Error(String(e)));
        return "error" as const;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setIsRunning(false);
        }
      }
    },
    [options],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    setData(options.initialData);
    setError(null);
  }, [options.initialData]);

  return { data, isRunning, error, start, cancel, reset };
}
