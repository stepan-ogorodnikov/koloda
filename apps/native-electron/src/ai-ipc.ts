import type { AISecrets, CardGenerationRequest, ChatStreamRequest, GeneratedCard, StreamUsage } from "@koloda/ai";
import { aiSecretsValidation, createAIGenerationClient, fetchModels, isAIError } from "@koloda/ai";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { ipcMain } from "electron";

export const AI_STREAM_CHANNEL = "ai:stream";

export type AiStreamEvent =
  | { requestId: string; type: "chunk"; chunk: string }
  | { requestId: string; type: "card"; card: GeneratedCard }
  | { requestId: string; type: "done"; usage?: StreamUsage }
  | { requestId: string; type: "error"; code: string; message: string };

type AiListModelsArgs = { profileId: string };

type AiChatStreamArgs = {
  requestId: string;
  profileId: string;
  request: ChatStreamRequest;
};

type AiGenerateCardsArgs = {
  requestId: string;
  profileId: string;
  request: Omit<CardGenerationRequest, "onCard" | "abortSignal">;
};

type AiAbortArgs = { requestId: string };

type KolodaDb = {
  getAiProfileSecrets: (profileId: string) => unknown;
};

// INVARIANT: Correlate concurrent streams by requestId; abort must cancel only that run.
const activeControllers = new Map<string, AbortController>();

function sendStreamEvent(sender: WebContents, event: AiStreamEvent) {
  if (sender.isDestroyed()) return;
  sender.send(AI_STREAM_CHANNEL, event);
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function toStreamError(error: unknown): Pick<Extract<AiStreamEvent, { type: "error" }>, "code" | "message"> {
  if (isAIError(error)) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: "unknown", message: error.message };
  return { code: "unknown", message: String(error) };
}

function throwIpcError(error: unknown): never {
  if (isAIError(error)) {
    throw new Error(JSON.stringify({ code: error.code, details: error.message }));
  }
  if (error instanceof Error) {
    throw new Error(JSON.stringify({ code: "unknown", details: error.message }));
  }
  throw new Error(JSON.stringify({ code: "unknown", details: String(error) }));
}

function loadSecrets(db: KolodaDb, profileId: string): AISecrets {
  const raw = db.getAiProfileSecrets(profileId);
  if (raw == null) {
    throw new Error(JSON.stringify({ code: "not-found.ai-profile", details: "No secrets loaded for AI profile" }));
  }
  return aiSecretsValidation.parse(raw);
}

function beginRequest(requestId: string): AbortController {
  activeControllers.get(requestId)?.abort();
  const controller = new AbortController();
  activeControllers.set(requestId, controller);
  return controller;
}

function endRequest(requestId: string, controller: AbortController) {
  if (activeControllers.get(requestId) === controller) {
    activeControllers.delete(requestId);
  }
}

export function registerAiIpc(db: KolodaDb) {
  ipcMain.handle("cmd_ai_list_models", async (_event, args: AiListModelsArgs) => {
    try {
      const secrets = loadSecrets(db, args.profileId);
      return await fetchModels(secrets);
    } catch (error) {
      throwIpcError(error);
    }
  });

  ipcMain.handle("cmd_ai_chat_stream", (event: IpcMainInvokeEvent, args: AiChatStreamArgs) => {
    const { requestId, profileId, request } = args;
    const sender = event.sender;
    // WHY: Register before any work so cmd_ai_abort during start binds to this run.
    const controller = beginRequest(requestId);

    let secrets: AISecrets;
    try {
      secrets = loadSecrets(db, profileId);
    } catch (error) {
      endRequest(requestId, controller);
      throwIpcError(error);
    }

    if (controller.signal.aborted) {
      endRequest(requestId, controller);
      sendStreamEvent(sender, { requestId, type: "error", code: "aborted", message: "Aborted" });
      return;
    }

    void (async () => {
      try {
        const client = createAIGenerationClient(secrets);
        const usage = await client.chat(
          request,
          (chunk) => {
            sendStreamEvent(sender, { requestId, type: "chunk", chunk });
          },
          controller.signal,
        );
        sendStreamEvent(sender, { requestId, type: "done", usage });
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          sendStreamEvent(sender, { requestId, type: "error", code: "aborted", message: "Aborted" });
          return;
        }
        const { code, message } = toStreamError(error);
        sendStreamEvent(sender, { requestId, type: "error", code, message });
      } finally {
        endRequest(requestId, controller);
      }
    })();
  });

  ipcMain.handle("cmd_ai_generate_cards", (event: IpcMainInvokeEvent, args: AiGenerateCardsArgs) => {
    const { requestId, profileId, request } = args;
    const sender = event.sender;
    // WHY: Register before any work so cmd_ai_abort during start binds to this run.
    const controller = beginRequest(requestId);

    let secrets: AISecrets;
    try {
      secrets = loadSecrets(db, profileId);
    } catch (error) {
      endRequest(requestId, controller);
      throwIpcError(error);
    }

    if (controller.signal.aborted) {
      endRequest(requestId, controller);
      sendStreamEvent(sender, { requestId, type: "error", code: "aborted", message: "Aborted" });
      return;
    }

    void (async () => {
      try {
        const client = createAIGenerationClient(secrets);
        await client.generateCards({
          ...request,
          abortSignal: controller.signal,
          onCard: (card) => {
            sendStreamEvent(sender, { requestId, type: "card", card });
          },
        });
        sendStreamEvent(sender, { requestId, type: "done" });
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          sendStreamEvent(sender, { requestId, type: "error", code: "aborted", message: "Aborted" });
          return;
        }
        const { code, message } = toStreamError(error);
        sendStreamEvent(sender, { requestId, type: "error", code, message });
      } finally {
        endRequest(requestId, controller);
      }
    })();
  });

  ipcMain.handle("cmd_ai_abort", (_event, args: AiAbortArgs) => {
    activeControllers.get(args.requestId)?.abort();
    return true;
  });
}
