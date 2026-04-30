import type { ChatStreamGenerator, StreamUsage } from "@koloda/srs";
import { useCallback } from "react";
import { useStreamingRequest, type StreamResult } from "./use-streaming-request";

export type UseChatStreamReturn = {
  text: string;
  isStreaming: boolean;
  error: Error | null;
  usage: StreamUsage | null;
  stream: (
    request: Parameters<ChatStreamGenerator>[0],
    onChunk: (chunk: string) => void,
  ) => Promise<{ streamResult: StreamResult; usage: StreamUsage | null }>;
  cancel: () => void;
};

export function useChatStream(streamGenerator: ChatStreamGenerator): UseChatStreamReturn {
  const { data: text, result: usage, isRunning: isStreaming, error, start, cancel } =
    useStreamingRequest<string, string, Parameters<ChatStreamGenerator>[0], StreamUsage | undefined>({
      initialData: "",
      accumulate: (prev, chunk) => prev + chunk,
      executor: streamGenerator,
    });

  const stream = useCallback(
    async (request: Parameters<ChatStreamGenerator>[0], onChunk: (chunk: string) => void) => {
      const { streamResult, result } = await start(request, onChunk);
      return { streamResult, usage: result ?? null };
    },
    [start],
  );

  return { text, isStreaming, error, usage: usage ?? null, stream, cancel };
}
