import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConversationPersistenceHost,
  SHUTDOWN_FLUSH_TIMEOUT_MS,
  SHUTDOWN_SAVE_MAX_ATTEMPTS,
} from "./conversation-persistence-host";
import { SAVE_RETRY_BASE_DELAY_MS } from "./create-conversation-save-queue";

describe("createConversationPersistenceHost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bootstraps dirty conversations from the initial pending map", async () => {
    const writes: string[] = [];
    const host = createConversationPersistenceHost({
      createWrite: (id) => async () => {
        writes.push(id);
        return true;
      },
      isStreaming: () => false,
      getInitialPending: () => ({ A: 1 }),
      subscribePendingSaves: () => () => {},
    });

    host.flushAllNow();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(writes).toEqual(["A"]);
    host.dispose();
  });

  it("flushAllBounded waits for in-flight writes before returning", async () => {
    let resolveWrite!: () => void;
    const writeStarted = vi.fn();
    const host = createConversationPersistenceHost({
      createWrite: () => async () => {
        writeStarted();
        await new Promise<void>((resolve) => {
          resolveWrite = resolve;
        });
        return true;
      },
      isStreaming: () => false,
      getInitialPending: () => ({ A: 1 }),
      subscribePendingSaves: () => () => {},
    });

    const bounded = host.flushAllBounded(100);
    await vi.advanceTimersByTimeAsync(0);
    expect(writeStarted).toHaveBeenCalledTimes(1);

    resolveWrite();
    await bounded;
    host.dispose();
  });

  it("flushAllBounded completes a queued N+1 write after the in-flight write finishes", async () => {
    const writes: Array<{
      resolve: (value: boolean) => void;
      promise: Promise<boolean>;
    }> = [];
    const write = vi.fn(() => {
      let resolve!: (value: boolean) => void;
      const promise = new Promise<boolean>((res) => {
        resolve = res;
      });
      writes.push({ resolve, promise });
      return promise;
    });
    let pending: Record<string, number> = { A: 1 };
    let listener: ((next: Record<string, number>) => void) | null = null;
    const host = createConversationPersistenceHost({
      createWrite: () => write,
      isStreaming: () => false,
      getInitialPending: () => ({ ...pending }),
      subscribePendingSaves: (l) => {
        listener = l;
        return () => {
          listener = null;
        };
      },
    });

    const bounded = host.flushAllBounded(100);
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);

    pending = { A: 2 };
    listener!(pending);
    expect(write).toHaveBeenCalledTimes(1);

    writes[0]!.resolve(true);
    await writes[0]!.promise;
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(write).toHaveBeenCalledTimes(2);

    writes[1]!.resolve(true);
    await bounded;
    host.dispose();
  });

  it("flushAllBounded returns when the timeout expires while a write is still in flight", async () => {
    const writeStarted = vi.fn();
    const host = createConversationPersistenceHost({
      createWrite: () => async () => {
        writeStarted();
        await new Promise<void>(() => {});
        return true;
      },
      isStreaming: () => false,
      getInitialPending: () => ({ A: 1 }),
      subscribePendingSaves: () => () => {},
    });

    const bounded = host.flushAllBounded(50);
    await vi.advanceTimersByTimeAsync(0);
    expect(writeStarted).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(50);
    await bounded;

    host.dispose();
  });

  it("shutdown retry count is capped", async () => {
    const write = vi.fn(async () => {
      throw new Error("db down");
    });
    const host = createConversationPersistenceHost({
      createWrite: () => write,
      isStreaming: () => false,
      getInitialPending: () => ({ A: 1 }),
      subscribePendingSaves: () => () => {},
    });

    const bounded = host.flushAllBounded(5_000);

    // Drive the flush loop: each failed attempt yields SAVE_RETRY_BASE_DELAY_MS.
    for (let i = 0; i < SHUTDOWN_SAVE_MAX_ATTEMPTS + 2; i += 1) {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(SAVE_RETRY_BASE_DELAY_MS);
    }
    await bounded;

    expect(write).toHaveBeenCalledTimes(SHUTDOWN_SAVE_MAX_ATTEMPTS);
    host.dispose();
  });

  it("flushAllBounded still allows up to SHUTDOWN_SAVE_MAX_ATTEMPTS when lifetime failures already at cap", async () => {
    const write = vi.fn(async () => {
      throw new Error("db down");
    });
    const host = createConversationPersistenceHost({
      createWrite: () => write,
      isStreaming: () => false,
      getInitialPending: () => ({ A: 1 }),
      subscribePendingSaves: () => () => {},
    });

    // Drive ordinary autosave failures until consecutiveFailures >= cap.
    for (let i = 0; i < SHUTDOWN_SAVE_MAX_ATTEMPTS; i += 1) {
      host.flushAllNow();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(write.mock.calls.length).toBeGreaterThanOrEqual(SHUTDOWN_SAVE_MAX_ATTEMPTS);
    const writesBeforeShutdown = write.mock.calls.length;

    const bounded = host.flushAllBounded(5_000);
    for (let i = 0; i < SHUTDOWN_SAVE_MAX_ATTEMPTS + 2; i += 1) {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(SAVE_RETRY_BASE_DELAY_MS);
    }
    await bounded;

    expect(write.mock.calls.length - writesBeforeShutdown).toBe(SHUTDOWN_SAVE_MAX_ATTEMPTS);
    host.dispose();
  });

  it("flushAllBounded caps and yields after mid-flush success with N+1 still dirty", async () => {
    // WHY: consecutiveFailures resets on ack — a local flush failure count must
    // still cap retries and keep failure yields after lifetime-at-cap → success
    // → subsequent rejects (otherwise the loop tight-spins until the deadline).
    const writes: Array<{
      resolve: (value: boolean) => void;
      promise: Promise<boolean>;
    }> = [];
    let mode: "fail-lifetime" | "succeed-once" | "fail-shutdown" = "fail-lifetime";
    const write = vi.fn(() => {
      if (mode === "fail-lifetime" || mode === "fail-shutdown") {
        return Promise.reject(new Error("db down"));
      }
      let resolve!: (value: boolean) => void;
      const promise = new Promise<boolean>((res) => {
        resolve = res;
      });
      writes.push({ resolve, promise });
      return promise;
    });
    let pending: Record<string, number> = { A: 1 };
    let listener: ((next: Record<string, number>) => void) | null = null;
    const host = createConversationPersistenceHost({
      createWrite: () => write,
      isStreaming: () => false,
      getInitialPending: () => ({ ...pending }),
      subscribePendingSaves: (l) => {
        listener = l;
        return () => {
          listener = null;
        };
      },
    });

    for (let i = 0; i < SHUTDOWN_SAVE_MAX_ATTEMPTS; i += 1) {
      host.flushAllNow();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
    }
    const writesBeforeShutdown = write.mock.calls.length;

    mode = "succeed-once";
    const bounded = host.flushAllBounded(5_000);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(writes).toHaveLength(1);

    pending = { A: 2 };
    listener!(pending);

    mode = "fail-shutdown";
    writes[0]!.resolve(true);
    await writes[0]!.promise;
    await Promise.resolve();

    for (let i = 0; i < SHUTDOWN_SAVE_MAX_ATTEMPTS + 2; i += 1) {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(SAVE_RETRY_BASE_DELAY_MS);
    }
    await bounded;

    // 1 success + SHUTDOWN_SAVE_MAX_ATTEMPTS rejects — not a deadline-burn spin.
    expect(write.mock.calls.length - writesBeforeShutdown).toBe(1 + SHUTDOWN_SAVE_MAX_ATTEMPTS);
    host.dispose();
  });

  it("retrySave flushes a dirty conversation immediately", async () => {
    let shouldFail = true;
    const write = vi.fn(async () => {
      if (shouldFail) throw new Error("db down");
      return true;
    });
    const host = createConversationPersistenceHost({
      createWrite: () => write,
      isStreaming: () => false,
      getInitialPending: () => ({ A: 1 }),
      subscribePendingSaves: () => () => {},
    });

    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(write).toHaveBeenCalled();
    write.mockClear();
    shouldFail = false;

    host.retrySave("A");
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    host.dispose();
  });

  it("documents the shutdown flush bound constant", () => {
    expect(SHUTDOWN_FLUSH_TIMEOUT_MS).toBe(2000);
    expect(SHUTDOWN_SAVE_MAX_ATTEMPTS).toBe(3);
  });
});
