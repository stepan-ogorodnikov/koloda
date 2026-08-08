import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConversationPersistenceHost, SHUTDOWN_FLUSH_TIMEOUT_MS } from "./conversation-persistence-host";

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

  it("documents the shutdown flush bound constant", () => {
    expect(SHUTDOWN_FLUSH_TIMEOUT_MS).toBe(2000);
  });
});
