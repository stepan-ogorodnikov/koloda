import { OPTIMIZER_PROGRESS_CHANNEL } from "@koloda/native-ipc";
import type { AlgorithmOptimization } from "@koloda/srs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOptimizerQueries } from "./optimizer-queries";

type InvokeFn = (cmd: string, args?: unknown) => Promise<unknown>;

const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

function emit(channel: string, event: unknown) {
  for (const listener of listeners.get(channel) ?? []) listener(event);
}

const invokeMock = vi.fn<InvokeFn>();

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// WHY: the run resolves only when the test says so, so events and aborts land while it is in flight.
function startedRun() {
  const run = deferred<AlgorithmOptimization>();
  invokeMock.mockImplementation(async (cmd) => (cmd === "cmd_optimize_algorithm" ? run.promise : undefined));
  return run;
}

function requestIdOf(cmd: string) {
  const call = invokeMock.mock.calls.find(([called]) => called === cmd);
  return (call?.[1] as { requestId: string } | undefined)?.requestId;
}

beforeEach(() => {
  listeners.clear();
  invokeMock.mockReset();
  vi.stubGlobal("window", {
    electronAPI: {
      invoke: invokeMock,
      on: (channel: string, callback: (...args: unknown[]) => void) => {
        const set = listeners.get(channel) ?? new Set();
        set.add(callback);
        listeners.set(channel, set);
        return () => {
          set.delete(callback);
        };
      },
    },
  });
});

describe("optimizeAlgorithm", () => {
  it("reports only its own run's progress and stops listening when the run ends", async () => {
    const run = startedRun();
    const onProgress = vi.fn();
    const result = createOptimizerQueries().optimizeAlgorithm({
      id: "a",
      onProgress,
      signal: new AbortController().signal,
    });
    await Promise.resolve();
    const requestId = requestIdOf("cmd_optimize_algorithm");

    emit(OPTIMIZER_PROGRESS_CHANNEL, { requestId: "another-run", current: 9, total: 10 });
    emit(OPTIMIZER_PROGRESS_CHANNEL, { requestId, current: 2, total: 10 });
    run.resolve({ status: "cancelled" });
    await result;
    emit(OPTIMIZER_PROGRESS_CHANNEL, { requestId, current: 3, total: 10 });

    expect(onProgress.mock.calls).toEqual([[{ current: 2, total: 10 }]]);
  });

  it.each([
    ["while it runs", false],
    ["before it starts", true],
  ])("cancels its own run when aborted %s", async (_case, isAbortedFirst) => {
    const run = startedRun();
    const controller = new AbortController();
    if (isAbortedFirst) controller.abort();

    const result = createOptimizerQueries().optimizeAlgorithm({
      id: "a",
      onProgress: () => {},
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();
    run.resolve({ status: "cancelled" });

    await expect(result).resolves.toEqual({ status: "cancelled" });
    const commands = invokeMock.mock.calls.map(([cmd]) => cmd);
    expect(commands).toEqual(["cmd_optimize_algorithm", "cmd_cancel_algorithm_optimization"]);
    expect(requestIdOf("cmd_cancel_algorithm_optimization")).toBe(requestIdOf("cmd_optimize_algorithm"));
  });
});
