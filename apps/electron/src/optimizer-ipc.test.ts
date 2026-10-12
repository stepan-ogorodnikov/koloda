import { OPTIMIZER_PROGRESS_CHANNEL } from "@koloda/native-ipc";
import type { OptimizerProgressEvent } from "@koloda/native-ipc";
import type { AlgorithmOptimization } from "@koloda/srs";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerOptimizerIpc } from "./optimizer-ipc";

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args: unknown) => unknown>(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, args: unknown) => unknown) =>
      electron.handlers.set(channel, handler),
  },
}));

// WHY: the sender check reads the frame URL against the app's navigation target; it has its own tests.
vi.mock("./app-sender", () => ({ assertAppSender: vi.fn() }));

class Sender extends EventEmitter {
  isGone = false;
  send = vi.fn();
  isDestroyed = () => this.isGone;
  destroy() {
    this.isGone = true;
    this.emit("destroyed");
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function registered() {
  const run = deferred<AlgorithmOptimization>();
  let report: (event: OptimizerProgressEvent) => void = () => {};
  const db = {
    optimizeAlgorithm: vi.fn((_params: { requestId: string; id: string }, onProgress: typeof report) => {
      report = onProgress;
      return run.promise;
    }),
    cancelAlgorithmOptimization: vi.fn(),
  };
  registerOptimizerIpc(db);
  const sender = new Sender();
  const result = electron.handlers.get("cmd_optimize_algorithm")?.({ sender }, { requestId: "run-1", id: "a" });
  return { db, sender, result, report: (event: OptimizerProgressEvent) => report(event), finish: run.resolve };
}

describe("optimizer runs", () => {
  afterEach(() => {
    electron.handlers.clear();
  });

  it("sends progress only to the window that started the run, while it is open", async () => {
    const { sender, result, report, finish } = registered();

    report({ requestId: "run-1", current: 3, total: 10 });
    sender.isGone = true;
    report({ requestId: "run-1", current: 4, total: 10 });
    finish({ status: "cancelled" });
    await result;

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith(OPTIMIZER_PROGRESS_CHANNEL, { requestId: "run-1", current: 3, total: 10 });
  });

  it("cancels a run when its window closes", async () => {
    const { db, sender, result, finish } = registered();

    sender.destroy();
    finish({ status: "cancelled" });

    await expect(result).resolves.toEqual({ status: "cancelled" });
    expect(db.cancelAlgorithmOptimization).toHaveBeenCalledWith({ requestId: "run-1" });
  });

  it("stops watching the window once the run ends", async () => {
    const { db, sender, result, finish } = registered();

    finish({ status: "cancelled" });
    await result;
    sender.destroy();

    expect(db.cancelAlgorithmOptimization).not.toHaveBeenCalled();
  });
});
