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
   * Stream an OpenAI tool-call step instead of assistant text.
   * Used so chat + `propose_cards` can hit the real host executor.
   */
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
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
        res.end(JSON.stringify(buildOpenAIChatCompletionJSON(modelId, text)));
        return;
      }

      const chunks = next.chunkBy === "all" ? [text] : text.split(/(\s+)/).filter((part) => part.length > 0);
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.end(buildOpenAIChatCompletionSSE(modelId, chunks));
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

export function buildOpenAIToolCallSSE(
  modelId: string,
  toolCall: { name: string; arguments: Record<string, unknown> },
): string {
  const id = "chatcmpl-e2e";
  const created = Math.floor(Date.now() / 1000);
  const callId = "call_e2e_propose_cards";
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
  toolCall: { name: string; arguments: Record<string, unknown> },
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
              id: "call_e2e_propose_cards",
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
