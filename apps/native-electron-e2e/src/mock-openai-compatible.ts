import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Dedicated Node mock — Electron main-process AI HTTP is invisible to Playwright
 * `page.route` after the AIRuntime cutover.
 */
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
   * Delay between SSE events in ms. The server writes each SSE event as its
   * own HTTP chunk with this pause in between; without it the whole body is
   * written at once.
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
   * Hold the response without fulfilling until `release()` is called.
   * Used for cancel / in-flight assertions.
   */
  hold?: boolean;
  /** HTTP status for the completions response (non-2xx for failure tests). */
  status?: number;
  /** JSON error body when `status` is not OK. */
  errorBody?: unknown;
};

export type MockOpenAICompatibleHandle = {
  /** LM Studio-style base URL including `/v1` (pass to `addLmStudioProfile`). */
  baseUrl: string;
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
 * Serve OpenAI-compatible `/v1/models` and `/v1/chat/completions` for main-process fetch.
 * Start before adding the LM Studio profile so model list loads from this mock.
 */
export async function mockOpenAICompatibleProvider(
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
  let releaseHold: (() => void) | null = null;

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/v1/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: modelId, object: "model" }] }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      completionRequests += 1;
      const next = queue.shift() ?? { ...defaultCompletion };
      const bodyText = await readBody(req);

      if (next.hold) {
        const aborted = await waitForHoldOrAbort(req);
        releaseHold = null;
        if (aborted || res.writableEnded) return;
      }

      const status = next.status ?? 200;
      if (status >= 400) {
        if (res.writableEnded) return;
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(next.errorBody ?? { error: { message: "Mock provider error" } }));
        return;
      }

      const text = next.text ?? "Hello from the mock assistant.";
      // WHY: doGenerate omits `stream`; only doStream sets `stream: true`. Defaulting to
      // SSE when the field is absent would break non-stream JSON completions.
      let stream = false;
      try {
        if (bodyText) {
          const body = JSON.parse(bodyText) as { stream?: boolean };
          stream = body.stream === true;
        }
      } catch {}

      if (res.writableEnded) return;

      if (next.toolCall) {
        if (!stream) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(buildOpenAIToolCallJSON(modelId, next.toolCall)));
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.end(buildOpenAIToolCallSSE(modelId, next.toolCall));
        return;
      }

      if (!stream) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(buildOpenAIChatCompletionJSON(modelId, text, next.usage)));
        return;
      }

      const chunks =
        next.chunks ?? (next.chunkBy === "all" ? [text] : text.split(/(\s+)/).filter((part) => part.length > 0));
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const body = buildOpenAIChatCompletionSSE(modelId, chunks, next.usage);
      if (next.chunkDelayMs != null && next.chunkDelayMs > 0) {
        await writeSseWithDelays(res, body, next.chunkDelayMs);
      } else {
        res.end(body);
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Not found" } }));
  }

  function waitForHoldOrAbort(req: http.IncomingMessage): Promise<boolean> {
    return new Promise((resolve) => {
      const onAbort = () => {
        cleanup();
        resolve(true);
      };
      const onRelease = () => {
        cleanup();
        resolve(false);
      };
      const cleanup = () => {
        req.off("close", onAbort);
        releaseHold = null;
      };
      req.once("close", onAbort);
      releaseHold = onRelease;
    });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/v1`;

  return {
    baseUrl,
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
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Write the finished SSE body event-by-event with `delayMs` pauses in between.
 * Splitting the body keeps the paced byte stream identical to the single-write
 * path (the body already ends with its blank separator line). Writes use the
 * callback form so an aborted connection reports through the callback instead
 * of emitting an unhandled 'error' on the response.
 */
async function writeSseWithDelays(res: http.ServerResponse, body: string, delayMs: number): Promise<void> {
  const events = body.split("\n\n").filter((part) => part.length > 0);
  res.flushHeaders();
  for (const [index, event] of events.entries()) {
    if (res.destroyed || res.writableEnded) return;
    if (index > 0) await sleep(delayMs);
    if (res.destroyed || res.writableEnded) return;
    res.write(`${event}\n\n`, () => {});
  }
  if (!res.destroyed && !res.writableEnded) res.end();
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
