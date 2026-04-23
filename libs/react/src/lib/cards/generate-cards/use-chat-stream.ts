import type { ChatStreamGenerator } from "@koloda/srs";
import { isAbortError } from "@koloda/srs";
import { useCallback, useRef, useState } from "react";

export type UseChatStreamReturn = {
  text: string;
  isStreaming: boolean;
  error: Error | null;
  stream: (
    request: Parameters<ChatStreamGenerator>[0],
    onChunk: (chunk: string) => void,
  ) => Promise<boolean>;
  cancel: () => void;
};

export function useChatStream(streamGenerator: ChatStreamGenerator): UseChatStreamReturn {
  const [text, setText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const stream = useCallback(
    async (request: Parameters<ChatStreamGenerator>[0], onChunk: (chunk: string) => void) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setIsStreaming(true);
      setError(null);
      setText("");

      try {
        await streamGenerator(
          request,
          (chunk) => {
            if (!controller.signal.aborted) {
              setText((prev) => prev + chunk);
              onChunk(chunk);
            }
          },
          controller.signal,
        );
        return true;
      } catch (e) {
        if (!controller.signal.aborted && !isAbortError(e)) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
        return false;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setIsStreaming(false);
        }
      }
    },
    [streamGenerator],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsStreaming(false);
  }, []);

  return { text, isStreaming, error, stream, cancel };
}
