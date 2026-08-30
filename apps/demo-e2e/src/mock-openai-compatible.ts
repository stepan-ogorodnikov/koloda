import type { Page, Route } from "@playwright/test";

/** Same-origin base URL so browser fetch avoids CORS (matches Playwright baseURL host/port). */
export const E2E_LM_STUDIO_BASE_URL = "http://127.0.0.1:4300/v1";

export const E2E_LM_STUDIO_MODEL_ID = "e2e-test-model";

export type MockChatCompletionOptions = {
  /** Full assistant text; split into SSE content deltas. */
  text?: string;
  /** How to split `text` into streamed chunks. Default: one chunk per word. */
  chunkBy?: "word" | "all";
  /**
   * Explicit SSE content deltas; overrides `text`/`chunkBy` when present.
   * Lets a fixture cut tags mid-chunk (e.g. `<thi` + `nk>`) the way real
   * models split streamed text.
   */
  chunks?: string[];
  /**
   * Delay between SSE events in ms. `route.fulfill` cannot stream a body, so
   * the fulfilled response carries a marker header and the page-side fetch
   * wrapper installed by `mockOpenAICompatibleProvider` re-streams the SSE
   * events with the requested delay. Default: single fulfill, all events at once.
   */
  chunkDelayMs?: number;
  /**
   * Token usage reported to the app for this completion (drives the run's
   * context-usage meter). Default: no usage — the app hides the meter.
   */
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  /**
   * Stream an OpenAI tool-call step instead of assistant text.
   * Used so chat + `propose_cards` can hit the real host executor.
   */
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
    /**
     * WHY: the app dedupes a run's tool calls by id, so two tool-call
     * responses in one run must not share an id; defaults to a unique
     * per-response `call_e2e_tool_N`.
     */
    id?: string;
  };
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

  // WHY: `route.fulfill` delivers the whole body at once, so mid-stream UI
  // states (partial reply text) cannot be asserted. This page-side wrapper
  // re-streams a fulfilled SSE body event-by-event when the response opts in
  // via the marker header below; every other response passes through.
  await page.addInitScript(() => {
    const pacingHeader = "x-e2e-sse-chunk-delay";
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      const chunkDelayMs = Number(response.headers.get(pacingHeader));
      if (!Number.isFinite(chunkDelayMs) || chunkDelayMs <= 0) return response;
      const body = await response.text();
      const events = body.split("\n\n").filter((part) => part.length > 0);
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder();
          for (const [index, event] of events.entries()) {
            if (index > 0) await new Promise((resolve) => setTimeout(resolve, chunkDelayMs));
            controller.enqueue(encoder.encode(`${event}\n\n`));
          }
          controller.close();
        },
      });
      const headers = new Headers(response.headers);
      headers.delete(pacingHeader);
      return new Response(stream, { status: response.status, statusText: response.statusText, headers });
    };
  });

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
    // SSE when the field is absent would break non-stream JSON completions.
    let stream = false;
    try {
      const raw = route.request().postData();
      if (raw) {
        const body = JSON.parse(raw) as { stream?: boolean };
        stream = body.stream === true;
      }
    } catch {
      // Keep non-stream default when body is missing/unparseable.
    }

    try {
      if (next.toolCall) {
        if (!stream) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(buildOpenAIToolCallJSON(modelId, next.toolCall)),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
          body: buildOpenAIToolCallSSE(modelId, next.toolCall),
        });
        return;
      }

      if (!stream) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(buildOpenAIChatCompletionJSON(modelId, text, next.usage)),
        });
        return;
      }

      const chunks =
        next.chunks ?? (next.chunkBy === "all" ? [text] : text.split(/(\s+)/).filter((part) => part.length > 0));
      const headers: Record<string, string> = {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      };
      if (next.chunkDelayMs != null && next.chunkDelayMs > 0) {
        headers["x-e2e-sse-chunk-delay"] = String(next.chunkDelayMs);
      }
      await route.fulfill({
        status: 200,
        headers,
        body: buildOpenAIChatCompletionSSE(modelId, chunks, next.usage),
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

/** OpenAI wire format for token usage; `total_tokens` is derived. */
function buildOpenAIUsage(usage: { promptTokens: number; completionTokens: number }) {
  return {
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.promptTokens + usage.completionTokens,
  };
}

export function buildOpenAIChatCompletionSSE(
  modelId: string,
  contentChunks: string[],
  usage?: { promptTokens: number; completionTokens: number },
): string {
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
      // WHY: the provider reads `usage` off any stream chunk and reports it on
      // the finish part; LM Studio sends it with the final chunk the same way.
      ...(usage ? { usage: buildOpenAIUsage(usage) } : {}),
    })}`,
  );
  lines.push("data: [DONE]");
  lines.push("");
  return lines.join("\n\n");
}

export function buildOpenAIToolCallSSE(
  modelId: string,
  toolCall: { name: string; arguments: Record<string, unknown>; id?: string },
): string {
  const id = "chatcmpl-e2e";
  const created = Math.floor(Date.now() / 1000);
  const callId = nextToolCallId(toolCall);
  const args = JSON.stringify(toolCall.arguments);

  const chunks = [
    {
      id,
      object: "chat.completion.chunk",
      created,
      model: modelId,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                index: 0,
                id: callId,
                type: "function",
                function: { name: toolCall.name, arguments: "" },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      id,
      object: "chat.completion.chunk",
      created,
      model: modelId,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [{ index: 0, function: { arguments: args } }],
          },
          finish_reason: null,
        },
      ],
    },
    {
      id,
      object: "chat.completion.chunk",
      created,
      model: modelId,
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
    },
  ];

  return [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`), "data: [DONE]", ""].join("\n\n");
}

export function buildOpenAIToolCallJSON(
  modelId: string,
  toolCall: { name: string; arguments: Record<string, unknown>; id?: string },
) {
  return {
    id: "chatcmpl-e2e",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: nextToolCallId(toolCall),
              type: "function",
              function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  };
}

let toolCallIdCounter = 0;

function nextToolCallId(toolCall: { name: string; arguments: Record<string, unknown>; id?: string }): string {
  // WHY: a unique id per response — the app's reducer dedupes tool calls by id
  // within a run, so a shared hardcoded id would collapse two tool calls in
  // one run into a single tool row.
  return toolCall.id ?? `call_e2e_tool_${++toolCallIdCounter}`;
}

export function buildOpenAIChatCompletionJSON(
  modelId: string,
  content: string,
  usage?: { promptTokens: number; completionTokens: number },
) {
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
    ...(usage ? { usage: buildOpenAIUsage(usage) } : {}),
  };
}
