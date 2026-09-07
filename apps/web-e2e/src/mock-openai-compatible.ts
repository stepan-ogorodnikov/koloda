import type { Page, Route } from "@playwright/test";
import {
  buildOpenAIChatCompletionJSON,
  buildOpenAIChatCompletionSSE,
  buildOpenAIToolCallJSON,
  buildOpenAIToolCallSSE,
  E2E_LM_STUDIO_MODEL_ID,
} from "@koloda/e2e";
import type { MockChatCompletionOptions, MockOpenAICompatibleHandle, MockOpenAICompatibleOptions } from "@koloda/e2e";

/** Same-origin base URL so browser fetch avoids CORS (matches Playwright baseURL host/port). */
export const E2E_LM_STUDIO_BASE_URL = "http://127.0.0.1:4300/v1";

/**
 * Intercept LM Studio OpenAI-compatible `/v1/models` and `/v1/chat/completions`.
 * Install before navigating to Assistant so the model list loads from the mock.
 */
export async function mockOpenAICompatibleProvider(
  page: Page,
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
    const requestBody = route.request().postData() ?? "";
    // WHY: FIFO entries first keep explicitly scripted steps deterministic; the
    // body-derived behavior only fills unscripted fall-through steps, and the
    // static default stays last. Without completionFromBody this resolves
    // exactly as before.
    const next = queue.shift() ?? options.completionFromBody?.(requestBody) ?? { ...defaultCompletion };

    if (next.shouldHold) {
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
    baseUrl: E2E_LM_STUDIO_BASE_URL,
    get completionRequests() {
      return completionRequests;
    },
    isHolding: () => releaseHold !== null,
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
