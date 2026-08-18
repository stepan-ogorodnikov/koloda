import type { AIRuntime, AssistantToolEvent } from "@koloda/ai";
import { AIError } from "@koloda/ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@koloda/app", () => {
  class AppError extends Error {
    constructor(
      public code: string,
      public details?: string,
    ) {
      // Match production AppError: message is the code; text lives on details.
      super(code);
      this.name = "AppError";
    }
  }
  return {
    AppError,
    isAppError: (error: unknown) => error instanceof AppError,
  };
});

import { AI_STREAM_CHANNEL, createElectronAIRuntime } from "./ai-runtime";

type InvokeFn = (cmd: string, args?: unknown) => Promise<unknown>;

const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

function emit(channel: string, event: unknown) {
  for (const listener of listeners.get(channel) ?? []) listener(event);
}

const invokeMock = vi.fn<InvokeFn>();

beforeEach(() => {
  listeners.clear();
  invokeMock.mockReset();
  const electronAPI = {
    invoke: invokeMock as Window["electronAPI"]["invoke"],
    on: (channel: string, callback: (...args: unknown[]) => void) => {
      const set = listeners.get(channel) ?? new Set();
      set.add(callback);
      listeners.set(channel, set);
      return () => {
        set.delete(callback);
      };
    },
    getZoomFactor: () => 1,
    getZoomLevel: () => 0,
    onZoomFactorChanged: () => () => {},
    zoomIn: () => {},
    zoomOut: () => {},
    zoomReset: () => {},
    setZoomLevel: () => {},
  };
  vi.stubGlobal("window", { electronAPI });
});

describe("createElectronAIRuntime", () => {
  it("lists models via request/response IPC", async () => {
    invokeMock.mockResolvedValueOnce([{ id: "m1", name: "Model", context_length: 1 }]);
    const runtime = createElectronAIRuntime();
    await expect(runtime.listModels("profile-1")).resolves.toEqual([{ id: "m1", name: "Model", context_length: 1 }]);
    expect(invokeMock).toHaveBeenCalledWith("cmd_ai_list_models", { profileId: "profile-1" });
  });

  it("streams chat chunks and resolves usage on done", async () => {
    invokeMock.mockImplementation(async (cmd, args) => {
      if (cmd !== "cmd_ai_chat_stream") return undefined;
      const { requestId } = args as { requestId: string };
      queueMicrotask(() => {
        emit(AI_STREAM_CHANNEL, { requestId, type: "chunk", chunk: "Hel" });
        emit(AI_STREAM_CHANNEL, { requestId, type: "chunk", chunk: "lo" });
        emit(AI_STREAM_CHANNEL, {
          requestId,
          type: "done",
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        });
      });
    });

    const runtime = createElectronAIRuntime();
    const chunks: string[] = [];
    const usage = await runtime.chat(
      "profile-1",
      { messages: [], input: { modelId: "m", prompt: "hi" } },
      (chunk) => chunks.push(chunk),
      new AbortController().signal,
    );

    expect(chunks).toEqual(["Hel", "lo"]);
    expect(usage).toEqual({ promptTokens: 1, completionTokens: 2, totalTokens: 3 });
  });

  it("uses a provided requestId for chat IPC", async () => {
    invokeMock.mockImplementation(async (cmd, args) => {
      if (cmd !== "cmd_ai_chat_stream") return undefined;
      const { requestId } = args as { requestId: string };
      queueMicrotask(() => {
        emit(AI_STREAM_CHANNEL, { requestId, type: "done" });
      });
    });

    const runtime = createElectronAIRuntime();
    await runtime.chat(
      "profile-1",
      { messages: [], input: { modelId: "m", prompt: "hi" } },
      () => {},
      new AbortController().signal,
      "host-req-chat",
    );

    expect(invokeMock).toHaveBeenCalledWith("cmd_ai_chat_stream", {
      requestId: "host-req-chat",
      profileId: "profile-1",
      request: { messages: [], input: { modelId: "m", prompt: "hi" } },
    });
  });

  it("forwards tool names and strips non-serializable callbacks from the chat payload", async () => {
    invokeMock.mockImplementation(async (cmd, args) => {
      if (cmd !== "cmd_ai_chat_stream") return undefined;
      const { requestId } = args as { requestId: string };
      queueMicrotask(() => {
        emit(AI_STREAM_CHANNEL, { requestId, type: "done" });
      });
    });

    const runtime = createElectronAIRuntime();
    await runtime.chat(
      "profile-1",
      {
        messages: [],
        input: { modelId: "m", prompt: "hi" },
        tools: ["list_decks"],
        onToolEvent: () => {},
      },
      () => {},
      new AbortController().signal,
      "host-req-chat",
    );

    expect(invokeMock).toHaveBeenCalledWith("cmd_ai_chat_stream", {
      requestId: "host-req-chat",
      profileId: "profile-1",
      request: { messages: [], input: { modelId: "m", prompt: "hi" }, tools: ["list_decks"] },
    });
  });

  it("maps tool stream events onto onToolEvent", async () => {
    invokeMock.mockImplementation(async (cmd, args) => {
      if (cmd !== "cmd_ai_chat_stream") return undefined;
      const { requestId } = args as { requestId: string };
      queueMicrotask(() => {
        emit(AI_STREAM_CHANNEL, {
          requestId,
          type: "toolCall",
          call: { id: "call-1", name: "list_decks", input: {} },
        });
        emit(AI_STREAM_CHANNEL, { requestId, type: "toolResult", callId: "call-1", output: { decks: [] } });
        emit(AI_STREAM_CHANNEL, { requestId, type: "toolResult", callId: "call-2", error: "Deck not found: 9" });
        emit(AI_STREAM_CHANNEL, { requestId, type: "chunk", chunk: "ok" });
        emit(AI_STREAM_CHANNEL, { requestId, type: "done" });
      });
    });

    const runtime = createElectronAIRuntime();
    const events: AssistantToolEvent[] = [];
    const chunks: string[] = [];
    await runtime.chat(
      "profile-1",
      {
        messages: [],
        input: { modelId: "m", prompt: "hi" },
        tools: ["list_decks"],
        onToolEvent: (event) => events.push(event),
      },
      (chunk) => chunks.push(chunk),
      new AbortController().signal,
    );

    expect(events).toEqual([
      { kind: "toolCall", call: { id: "call-1", name: "list_decks", input: {} } },
      { kind: "toolResult", callId: "call-1", output: { decks: [] } },
      { kind: "toolResult", callId: "call-2", error: "Deck not found: 9" },
    ]);
    expect(chunks).toEqual(["ok"]);
  });

  it("aborts an in-flight chat by requestId", async () => {
    let seenAbortId: string | undefined;
    invokeMock.mockImplementation(async (cmd, args) => {
      if (cmd === "cmd_ai_chat_stream") {
        return undefined;
      }
      if (cmd === "cmd_ai_abort") {
        seenAbortId = (args as { requestId: string }).requestId;
        return true;
      }
      return undefined;
    });

    const runtime = createElectronAIRuntime();
    const controller = new AbortController();
    const pending = runtime.chat(
      "profile-1",
      { messages: [], input: { modelId: "m", prompt: "hi" } },
      () => {},
      controller.signal,
      "host-req-chat",
    );

    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(seenAbortId).toBe("host-req-chat");
    expect(invokeMock).toHaveBeenCalledWith("cmd_ai_abort", { requestId: "host-req-chat" });
  });

  it("does not start chat IPC when signal is already aborted", async () => {
    invokeMock.mockResolvedValue(true);
    const controller = new AbortController();
    controller.abort();

    const runtime = createElectronAIRuntime();
    await expect(
      runtime.chat("profile-1", { messages: [], input: { modelId: "m", prompt: "hi" } }, () => {}, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(invokeMock).not.toHaveBeenCalledWith("cmd_ai_chat_stream", expect.anything());
  });

  it("re-aborts after start invoke when canceled during start", async () => {
    let releaseStart!: () => void;
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const abortRequestIds: string[] = [];

    invokeMock.mockImplementation(async (cmd, args) => {
      if (cmd === "cmd_ai_chat_stream") {
        await startGate;
        return undefined;
      }
      if (cmd === "cmd_ai_abort") {
        abortRequestIds.push((args as { requestId: string }).requestId);
        return true;
      }
      return undefined;
    });

    const runtime = createElectronAIRuntime();
    const controller = new AbortController();
    const pending = runtime.chat(
      "profile-1",
      { messages: [], input: { modelId: "m", prompt: "hi" } },
      () => {},
      controller.signal,
    );

    await Promise.resolve();
    controller.abort();
    expect(abortRequestIds).toHaveLength(1);

    releaseStart();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(abortRequestIds).toHaveLength(2);
    expect(abortRequestIds[0]).toBe(abortRequestIds[1]);
  });

  it("rejects with AIError when the stream reports an error", async () => {
    invokeMock.mockImplementation(async (cmd, args) => {
      if (cmd !== "cmd_ai_chat_stream") return undefined;
      const { requestId } = args as { requestId: string };
      queueMicrotask(() => {
        emit(AI_STREAM_CHANNEL, { requestId, type: "error", code: "ai.http.401", message: "Unauthorized" });
      });
    });

    const runtime: AIRuntime = createElectronAIRuntime();
    await expect(
      runtime.chat(
        "profile-1",
        { messages: [], input: { modelId: "m", prompt: "hi" } },
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toEqual(new AIError("ai.http.401", "Unauthorized"));
  });

  it("surfaces invoke failures as AIError with details (not the AppError code)", async () => {
    invokeMock.mockRejectedValueOnce(
      Object.assign(
        new Error(
          'Error invoking remote method \'cmd_ai_list_models\': Error: {"code":"validation.settings-ai.providers.apiKey","details":"apiKey is required"}',
        ),
        // Electron sometimes attaches a system code; must not win over JSON payload.
        { code: "ERR_FAILED" },
      ),
    );

    const runtime = createElectronAIRuntime();
    await expect(runtime.listModels("profile-1")).rejects.toEqual(
      new AIError("validation.settings-ai.providers.apiKey", "apiKey is required"),
    );
  });

  it("fails the stream waiter when chat start invoke rejects", async () => {
    invokeMock.mockRejectedValueOnce(
      new Error(JSON.stringify({ code: "not-found.ai-profile", details: "No secrets loaded for AI profile" })),
    );

    const runtime = createElectronAIRuntime();
    await expect(
      runtime.chat(
        "profile-1",
        { messages: [], input: { modelId: "m", prompt: "hi" } },
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toEqual(new AIError("not-found.ai-profile", "No secrets loaded for AI profile"));
  });
});
