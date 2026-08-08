import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConversationSaveQueue } from "./create-conversation-save-queue";
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
    const queue = createConversationSaveQueue({ write, isStreaming });

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

  it("failed write leaves the queue dirty until a later notifyDirty", async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    let call = 0;
    const write = vi.fn(() => {
      call += 1;
      return call === 1 ? first.promise : second.promise;
    });
    const queue = createConversationSaveQueue({
      write,
      isStreaming: () => false,
    });

    queue.notifyDirty();
    await vi.advanceTimersByTimeAsync(0);
    first.reject(new Error("db down"));
    await first.promise.catch(() => {});
    await Promise.resolve();
    expect(queue.isDirty()).toBe(true);

    // No auto-retry without a newer dirty.
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS * 2);
    expect(write).toHaveBeenCalledTimes(1);

    queue.notifyDirty();
    await vi.advanceTimersByTimeAsync(IDLE_SAVE_DEBOUNCE_MS);
    expect(write).toHaveBeenCalledTimes(2);
    second.resolve(true);
    await second.promise;
    await Promise.resolve();
    expect(queue.isDirty()).toBe(false);
  });

  it("throttles while streaming", async () => {
    const write = vi.fn(async () => true);
    const queue = createConversationSaveQueue({
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
