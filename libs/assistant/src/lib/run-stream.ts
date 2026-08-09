import type { AIChatMode } from "@koloda/ai";
import type { StreamResult } from "./stream-result";

/**
 * Per-kind spec for {@link runStream}. The two stream transports diverge in
 * three places, not one:
 *   - `onValue` — the per-chunk callback (chat accumulates text + dispatches
 *     `updateAssistantText`; cards dispatch `addCard`), returning the updated
 *     accumulator.
 *   - the transport's *result shape* (chat returns `{ streamResult, usage }`;
 *     cards return `StreamResult`), which `finalize` adapts into the
 *     `StreamResult` consumed by `handleStreamResult`.
 *   - `finalize` — kind-specific post-stream dispatches *before* the terminal
 *     status: chat re-dispatches the final accumulated text on abort and
 *     dispatches `setUsage`; cards have nothing to do and just return the
 *     result.
 */
export type RunExecution<TRequest, TValue, TResult, TAcc> = {
  mode: AIChatMode;
  transport: (request: TRequest, onValue: (v: TValue) => void) => Promise<TResult>;
  initial: TAcc;
  onValue: (acc: TAcc, value: TValue) => TAcc;
  finalize: (result: TResult, acc: TAcc) => StreamResult;
};

/**
 * Shared run funnel: transport → finalize → `handleStreamResult`.
 */
export async function runStream<TRequest, TValue, TResult, TAcc>(
  exec: RunExecution<TRequest, TValue, TResult, TAcc>,
  conversationId: string,
  runId: string,
  request: TRequest,
  handleStreamResult: (conversationId: string, result: StreamResult, runId: string) => void,
): Promise<void> {
  let acc = exec.initial;
  const result = await exec.transport(request, (v) => {
    acc = exec.onValue(acc, v);
  });
  const streamResult = exec.finalize(result, acc);
  handleStreamResult(conversationId, streamResult, runId);
}
