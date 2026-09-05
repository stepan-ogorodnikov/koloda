import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  buildOpenAIChatCompletionJSON,
  buildOpenAIChatCompletionSSE,
  buildOpenAIToolCallJSON,
  buildOpenAIToolCallSSE,
  E2E_LM_STUDIO_MODEL_ID,
} from "@koloda/e2e";
import type { MockChatCompletionOptions, MockOpenAICompatibleHandle, MockOpenAICompatibleOptions } from "@koloda/e2e";

/**
 * Dedicated Node mock — Electron main-process AI HTTP is invisible to Playwright
 * `page.route` after the AIRuntime cutover.
 */
export async function mockOpenAICompatibleProvider(
  options: MockOpenAICompatibleOptions = {},
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
      const bodyText = await readBody(req);
      // WHY: FIFO entries first keep explicitly scripted steps deterministic; the
      // body-derived behavior only fills unscripted fall-through steps, and the
      // static default stays last. Without completionFromBody this resolves
      // exactly as before.
      const next = queue.shift() ?? options.completionFromBody?.(bodyText) ?? { ...defaultCompletion };

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
