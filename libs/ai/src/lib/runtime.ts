import type { ChatStreamRequest } from "./generation";
import type { AIModel, StreamUsage } from "./models";

// INVARIANT: Host adapters implement this (Electron main / demo). Shared React
// must call by `profileId` only — never with usable secrets. Method shapes mirror
// `AIGenerationClient` so adapters can wrap `createAIGenerationClient`.
export type AIRuntime = {
  listModels: (profileId: string) => Promise<AIModel[]>;
  chat: (
    profileId: string,
    request: ChatStreamRequest,
    onChunk: (chunk: string) => void,
    abortSignal: AbortSignal,
    /** Host correlation id; Electron uses this for IPC when provided. */
    requestId?: string,
  ) => Promise<StreamUsage | undefined>;
};
