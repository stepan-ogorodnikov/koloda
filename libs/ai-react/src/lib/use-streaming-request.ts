import { useCallback, useEffect, useRef, useState } from "react";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export type StreamResult = "success" | "aborted" | "error";

export type StreamExecutor<TChunk, TRequest, TResult = void> = (
  request: TRequest,
  onChunk: (chunk: TChunk) => void,
  signal: AbortSignal,
) => Promise<TResult>;

export type StreamingStartResult<TResult = void> = {
  streamResult: StreamResult;
  result: TResult | null;
};

export type UseStreamingRequestReturn<TData, TChunk, TRequest, TResult = void> = {
  data: TData;
  result: TResult | null;
  isRunning: boolean;
  error: Error | null;
  start: (request: TRequest, onChunk?: (chunk: TChunk) => void) => Promise<StreamingStartResult<TResult>>;
  cancel: () => void;
  reset: () => void;
};

export function useStreamingRequest<TData, TChunk, TRequest, TResult = void>(options: {
  initialData: TData;
  accumulate: (prev: TData, chunk: TChunk) => TData;
  executor: StreamExecutor<TChunk, TRequest, TResult>;
}): UseStreamingRequestReturn<TData, TChunk, TRequest, TResult> {
  const [data, setData] = useState<TData>(options.initialData);
  const [result, setResult] = useState<TResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const start = useCallback(
    async (request: TRequest, onChunk?: (chunk: TChunk) => void) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setIsRunning(true);
      setError(null);
      setResult(null);
      setData(optionsRef.current.initialData);

      try {
        const executorResult = await optionsRef.current.executor(
          request,
          (chunk) => {
            if (!controller.signal.aborted) {
              setData((prev) => optionsRef.current.accumulate(prev, chunk));
              onChunk?.(chunk);
            }
          },
          controller.signal,
        );
        setResult(executorResult ?? null);
        return { streamResult: "success" as const, result: executorResult ?? null };
      } catch (e) {
        if (controller.signal.aborted || isAbortError(e)) return { streamResult: "aborted" as const, result: null };
        setError(e instanceof Error ? e : new Error(String(e)));
        return { streamResult: "error" as const, result: null };
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setIsRunning(false);
        }
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsRunning(false);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setData(optionsRef.current.initialData);
    setError(null);
  }, []);

  return { data, result, isRunning, error, start, cancel, reset };
}
