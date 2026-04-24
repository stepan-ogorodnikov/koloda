import type { ChatStreamGenerator } from "@koloda/srs";
import { useCallback } from "react";
import { useStreamingRequest, type StreamResult } from "./use-streaming-request";

export type UseChatStreamReturn = {
  text: string;
  isStreaming: boolean;
  error: Error | null;
  stream: (
    request: Parameters<ChatStreamGenerator>[0],
    onChunk: (chunk: string) => void,
  ) => Promise<StreamResult>;
  cancel: () => void;
};

export function useChatStream(streamGenerator: ChatStreamGenerator): UseChatStreamReturn {
  const { data: text, isRunning: isStreaming, error, start, cancel } =
    useStreamingRequest<string, string, Parameters<ChatStreamGenerator>[0]>({
      initialData: "",
      accumulate: (prev, chunk) => prev + chunk,
      executor: streamGenerator,
    });

  const stream = useCallback(
    async (request: Parameters<ChatStreamGenerator>[0], onChunk: (chunk: string) => void) => {
      return start(request, onChunk);
    },
    [start],
  );

  return { text, isStreaming, error, stream, cancel };
}
