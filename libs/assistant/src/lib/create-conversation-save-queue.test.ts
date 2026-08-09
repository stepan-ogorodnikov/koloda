import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  categorizeSaveError,
  computeSaveRetryDelayMs,
  createConversationSaveQueue,
  SAVE_RETRY_BASE_DELAY_MS,
  SAVE_RETRY_MAX_DELAY_MS,
} from "./create-conversation-save-queue";
import { IDLE_SAVE_DEBOUNCE_MS, STREAM_SAVE_THROTTLE_MS } from "./create-save-scheduler";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createConversationSaveQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serializes writes so a second flush waits for the in-flight write", async () => {
    const writes: Array<ReturnType<typeof deferred<boolean>>> = [];
    const write = vi.fn(() => {
      const d = deferred<boolean>();
      writes.push(d);
      return d.promise;
    });
    const isStreaming = vi.fn(() => false);
    const queue = createConversationSaveQueue({ conversationId: "A", write, isStreaming });

    queue.notifyDirty();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);

    // Dirtied again while N is in flight — must not start a parallel write.
    queue.notifyDirty();
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.isDirty()).toBe(true);

    writes[0]!.resolve(true);
    await writes[0]!.promise;
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    expect(write).toHaveBeenCalledTimes(2);

    writes[1]!.resolve(true);
    await writes[1]!.promise;
    await Promise.resolve();
    expect(queue.isDirty()).toBe(false);
  });

  it("ack of N does not clear dirty when N+1 was queued during the write", async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    let call = 0;
    const write = vi.fn(() => {
      call += 1;
      return call === 1 ? first.promise : second.promise;
    });
    const queue = createConversationSaveQueue({
      conversationId: "A",
      write,
      isStreaming: () => false,
    });

    queue.notifyDirty();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.isDirty()).toBe(true);

    // Queue N+1 while N is in flight.
    queue.notifyDirty();
    expect(queue.isDirty()).toBe(true);

    first.resolve(true);
    await first.promise;
    await Promise.resolve();
    // Ack of N must leave dirty set — N+1 is still outstanding.
    expect(queue.isDirty()).toBe(true);

    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    expect(write).toHaveBeenCalledTimes(2);

    second.resolve(true);
    await second.promise;
    await Promise.resolve();
    expect(queue.isDirty()).toBe(false);
  });

  it("persists the latest snapshot after overlapping in-flight and queued dirties", async () => {
    const snapshots: string[] = [];
    let latest = "N";
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    let call = 0;
    const write = vi.fn(async () => {
      call += 1;
      const snap = latest;
      if (call === 1) {
        await first.promise;
      } else {
        await second.promise;
      }
      snapshots.push(snap);
      return true;
    });
    const queue = createConversationSaveQueue({
      conversationId: "A",
      write,
      isStreaming: () => false,
    });

    queue.notifyDirty();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);

    latest = "N+1";
    queue.notifyDirty();

    first.resolve(true);
    await first.promise;
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);

    expect(write).toHaveBeenCalledTimes(2);
    second.resolve(true);
    await second.promise;
    await Promise.resolve();

    expect(snapshots).toEqual(["N", "N+1"]);
    expect(queue.isDirty()).toBe(false);
  });

  it("failed saves retry with bounded backoff and can be retried manually", async () => {
    const random = vi.fn(() => 0); // jitter factor 0.5 → delay = floor(base * 0.5)
    const logSaveFailure = vi.fn();
    const write = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error("db down"))
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(true);

    const queue = createConversationSaveQueue({
      conversationId: "conv-1",
      write,
      isStreaming: () => false,
      random,
      logSaveFailure,
    });

    queue.notifyDirty();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.isDirty()).toBe(true);
    expect(queue.consecutiveFailures()).toBe(1);
    expect(logSaveFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        generation: 1,
        attempt: 1,
        errorCategory: "unknown",
        message: "db down",
      }),
    );

    const firstDelay = computeSaveRetryDelayMs(1, random);
    expect(firstDelay).toBe(Math.floor(SAVE_RETRY_BASE_DELAY_MS * 0.5));

    await vi.advanceTimersByTimeAsync(firstDelay - 1);
    expect(write).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(2);
    expect(queue.consecutiveFailures()).toBe(2);
    expect(logSaveFailure).toHaveBeenCalledTimes(2);

    // Manual retry cancels backoff and attempts immediately.
    const secondDelay = computeSaveRetryDelayMs(2, random);
    await vi.advanceTimersByTimeAsync(secondDelay / 2);
    expect(write).toHaveBeenCalledTimes(2);
    queue.flushNow();
    await Promise.resolve();
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(3);
    expect(queue.isDirty()).toBe(false);
    expect(queue.consecutiveFailures()).toBe(0);

    // Pending backoff must not fire after the successful manual retry.
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_MAX_DELAY_MS);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it("cancels retry timers on dispose", async () => {
    const write = vi.fn<() => Promise<boolean>>().mockRejectedValue(new Error("db down"));
    const queue = createConversationSaveQueue({
      conversationId: "A",
      write,
      isStreaming: () => false,
      random: () => 0,
    });

    queue.notifyDirty();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);

    queue.dispose();
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_MAX_DELAY_MS);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("throttles while streaming", async () => {
    const write = vi.fn(async () => true);
    const queue = createConversationSaveQueue({
      conversationId: "A",
      write,
      isStreaming: () => true,
    });

    queue.notifyDirty();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);

    queue.notifyDirty();
    await vi.advanceTimersByTimeAsync(STREAM_SAVE_THROTTLE_MS - 1);
    expect(write).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(2);
  });
});

describe("computeSaveRetryDelayMs / categorizeSaveError", () => {
  it("bounds exponential delay and applies jitter", () => {
    expect(computeSaveRetryDelayMs(1, () => 0)).toBe(Math.floor(SAVE_RETRY_BASE_DELAY_MS * 0.5));
    expect(computeSaveRetryDelayMs(1, () => 1)).toBe(SAVE_RETRY_BASE_DELAY_MS);
    expect(computeSaveRetryDelayMs(20, () => 1)).toBe(SAVE_RETRY_MAX_DELAY_MS);
  });

  it("categorizes save errors", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(categorizeSaveError(abort)).toBe("aborted");
    expect(categorizeSaveError(new Error("network failed"))).toBe("network");
    expect(categorizeSaveError(new Error("SQLITE_FULL"))).toBe("storage");
    expect(categorizeSaveError(new Error("nope"))).toBe("unknown");
  });
});
