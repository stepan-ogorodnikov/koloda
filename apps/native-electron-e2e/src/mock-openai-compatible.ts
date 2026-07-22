import type { Page, Route } from "@playwright/test";

/** Same-origin base URL so renderer fetch avoids CORS (matches Electron Vite host/port). */
export const E2E_LM_STUDIO_BASE_URL = "http://localhost:3000/v1";

export const E2E_LM_STUDIO_MODEL_ID = "e2e-test-model";

export type MockChatCompletionOptions = {
  /** Full assistant text; split into SSE content deltas. */
  text?: string;
  /** How to split `text` into streamed chunks. Default: one chunk per word. */
  chunkBy?: "word" | "all";
  /**
   * Hold the route without fulfilling until `release()` is called.
   * Used for cancel / in-flight assertions.
   */
  hold?: boolean;
  /** HTTP status for the completions response (non-2xx for failure tests). */
  status?: number;
  /** JSON error body when `status` is not OK. */
  errorBody?: unknown;
};

export type MockOpenAICompatibleHandle = {
  /** Completions requests observed so far. */
  completionRequests: number;
  /** Resolve a held completions response (no-op if not holding). */
  release: () => void;
  /** Queue the next completions behavior (FIFO). Falls back to `defaultCompletion`. */
  enqueueCompletion: (options: MockChatCompletionOptions) => void;
  /** Replace the default completions behavior for subsequent requests. */
  setDefaultCompletion: (options: MockChatCompletionOptions) => void;
  dispose: () => Promise<void>;
};

/**
 * Intercept LM Studio OpenAI-compatible `/v1/models` and `/v1/chat/completions`.
 * Install before navigating to Assistant so the model list loads from the mock.
 */
export async function mockOpenAICompatibleProvider(
  page: Page,
  options: {
    modelId?: string;
    defaultCompletion?: MockChatCompletionOptions;
  } = {},
): Promise<MockOpenAICompatibleHandle> {
  const modelId = options.modelId ?? E2E_LM_STUDIO_MODEL_ID;
  const queue: MockChatCompletionOptions[] = [];
  let defaultCompletion: MockChatCompletionOptions = {
    text: "Hello from the mock assistant.",
    chunkBy: "word",
    ...options.defaultCompletion,
  };
  let completionRequests = 0;

  const modelsHandler = async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ id: modelId, object: "model" }],
      }),
    });
  };

  let releaseHold: (() => void) | null = null;

  const completionsHandler = async (route: Route) => {
    completionRequests += 1;
    const next = queue.shift() ?? { ...defaultCompletion };

    if (next.hold) {
      await new Promise<void>((resolve) => {
        releaseHold = resolve;
      });
      releaseHold = null;
    }

    const status = next.status ?? 200;
    if (status >= 400) {
      try {
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(next.errorBody ?? { error: { message: "Mock provider error" } }),
        });
      } catch {
        // Request may have been aborted (cancel).
      }
      return;
    }

    const text = next.text ?? "Hello from the mock assistant.";
    // doGenerate omits `stream`; only doStream sets `stream: true`. Defaulting to
    // SSE when the field is absent breaks generateText (cards fallback) with
    // "Invalid JSON response".
    let stream = false;
    let wantsStructured = false;
    try {
      const raw = route.request().postData();
      if (raw) {
        const body = JSON.parse(raw) as { stream?: boolean; response_format?: unknown };
        stream = body.stream === true;
        // LM Studio card generation sets supportsStructuredOutputs and sends
        // response_format. Reject so runCardGeneration falls back to generateText
        // + markdown parse against this mock's plain completion body.
        wantsStructured = body.response_format != null;
      }
    } catch {
      // Keep non-stream default when body is missing/unparseable.
    }

    try {
      if (wantsStructured) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: { message: "E2E mock does not support structured outputs" },
          }),
        });
        return;
      }

      if (!stream) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(buildOpenAIChatCompletionJSON(modelId, text)),
        });
        return;
      }

      const chunks = next.chunkBy === "all" ? [text] : text.split(/(\s+)/).filter((part) => part.length > 0);
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: buildOpenAIChatCompletionSSE(modelId, chunks),
      });
    } catch {
      // Aborted while fulfilling.
    }
  };

  await page.route("**/v1/models", modelsHandler);
  await page.route("**/v1/chat/completions", completionsHandler);

  return {
    get completionRequests() {
      return completionRequests;
    },
    release: () => releaseHold?.(),
    enqueueCompletion: (opts) => {
      queue.push({ ...opts });
    },
    setDefaultCompletion: (opts) => {
      defaultCompletion = { text: "Hello from the mock assistant.", chunkBy: "word", ...opts };
    },
    dispose: async () => {
      releaseHold?.();
      await page.unroute("**/v1/models", modelsHandler);
      await page.unroute("**/v1/chat/completions", completionsHandler);
    },
  };
}

export function buildOpenAIChatCompletionSSE(modelId: string, contentChunks: string[]): string {
  const lines: string[] = [];
  const id = "chatcmpl-e2e";
  const created = Math.floor(Date.now() / 1000);

  contentChunks.forEach((content, index) => {
    const delta = index === 0 ? { role: "assistant", content } : { content };
    lines.push(
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model: modelId,
        choices: [{ index: 0, delta, finish_reason: null }],
      })}`,
    );
  });

  lines.push(
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model: modelId,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    })}`,
  );
  lines.push("data: [DONE]");
  lines.push("");
  return lines.join("\n\n");
}

export function buildOpenAIChatCompletionJSON(modelId: string, content: string) {
  return {
    id: "chatcmpl-e2e",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
  };
}
