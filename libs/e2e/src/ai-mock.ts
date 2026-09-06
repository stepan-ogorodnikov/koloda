/**
 * Transport-independent half of the OpenAI-compatible AI mock: the option and
 * handle contracts plus the SSE/JSON wire builders. Each e2e suite supplies its
 * own transport around these (see the suites' `mock-openai-compatible.ts`):
 * demo intercepts with Playwright `page.route`, Electron runs a real Node HTTP
 * server because main-process AI fetch is invisible to route interception.
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
   * Delay between SSE events in ms; the suite's mock transport delivers the
   * events one by one with this pause. Default: all events at once.
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
  /**
   * Whether a completions response is currently held pending `release()`.
   * Release is a no-op while this is false, so tests that release a response
   * held right after sending a message must wait for this first — the request
   * only reaches the mock asynchronously (Electron main-process fetch).
   */
  isHolding: () => boolean;
  /** Resolve a held completions response (no-op if not holding). */
  release: () => void;
  /** Queue the next completions behavior (FIFO). Falls back to `defaultCompletion`. */
  enqueueCompletion: (options: MockChatCompletionOptions) => void;
  /** Replace the default completions behavior for subsequent requests. */
  setDefaultCompletion: (options: MockChatCompletionOptions) => void;
  dispose: () => Promise<void>;
};

export type MockOpenAICompatibleOptions = {
  modelId?: string;
  defaultCompletion?: MockChatCompletionOptions;
  /**
   * Completions behavior computed from the raw request body when the FIFO queue
   * is empty. Lets a fixture reply with text derived from what the model
   * actually received (e.g. echo tool-result rows back as reply text).
   */
  completionFromBody?: (requestBody: string) => MockChatCompletionOptions;
};

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
