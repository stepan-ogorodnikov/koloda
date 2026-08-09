import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaveScheduler, IDLE_SAVE_DEBOUNCE_MS, STREAM_SAVE_THROTTLE_MS } from "./create-save-scheduler";

describe("createSaveScheduler", () => {
  let flush: ReturnType<typeof vi.fn<() => void>>;
  let isStreaming: ReturnType<typeof vi.fn<() => boolean>>;

  beforeEach(() => {
    vi.useFakeTimers();
    flush = vi.fn();
    isStreaming = vi.fn(() => false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeScheduler() {
    return createSaveScheduler({
      flush,
      throttleMs: STREAM_SAVE_THROTTLE_MS,
      debounceMs: IDLE_SAVE_DEBOUNCE_MS,
      isStreaming,
    });
  }

  it("fires the first schedule immediately, then debounces idle follow-ups", () => {
    const scheduler = makeScheduler();
    scheduler.schedule();
    vi.advanceTimersByTime(0);
    expect(flush).toHaveBeenCalledTimes(1);

    flush.mockClear();
    scheduler.schedule();
    scheduler.schedule();
    vi.advanceTimersByTime(IDLE_SAVE_DEBOUNCE_MS - 1);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("throttles follow-up schedules while streaming", () => {
    isStreaming.mockReturnValue(true);
    const scheduler = makeScheduler();
    scheduler.schedule();
    vi.advanceTimersByTime(0);
    expect(flush).toHaveBeenCalledTimes(1);

    flush.mockClear();
    scheduler.schedule();
    vi.advanceTimersByTime(STREAM_SAVE_THROTTLE_MS - 1);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("continuous chunks produce checkpoints at each throttle window", () => {
    isStreaming.mockReturnValue(true);
    const scheduler = makeScheduler();

    scheduler.schedule();
    expect(flush).toHaveBeenCalledTimes(1);

    const chunkIntervalMs = 50;
    const windows = 3;
    for (let t = chunkIntervalMs; t <= STREAM_SAVE_THROTTLE_MS * windows; t += chunkIntervalMs) {
      vi.advanceTimersByTime(chunkIntervalMs);
      scheduler.schedule();
    }

    // Leading + one trailing save per completed throttle window.
    expect(flush).toHaveBeenCalledTimes(1 + windows);
  });

  it("terminal state forces the final save", () => {
    isStreaming.mockReturnValue(true);
    const scheduler = makeScheduler();

    scheduler.schedule();
    expect(flush).toHaveBeenCalledTimes(1);

    flush.mockClear();
    scheduler.schedule();
    vi.advanceTimersByTime(STREAM_SAVE_THROTTLE_MS / 2);
    scheduler.schedule();
    expect(flush).not.toHaveBeenCalled();

    scheduler.flushNow();
    expect(flush).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(STREAM_SAVE_THROTTLE_MS);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("clamps an idle-then-streaming reschedule into the throttle window", () => {
    const scheduler = makeScheduler();
    scheduler.schedule();
    vi.advanceTimersByTime(0);
    flush.mockClear();

    scheduler.schedule();
    const idleElapsedMs = 100;
    vi.advanceTimersByTime(idleElapsedMs);
    isStreaming.mockReturnValue(true);
    scheduler.schedule();

    // Must not flush at the leftover idle debounce (~150ms); only at
    // lastFlushedAt + throttleMs (remaining = throttleMs - idleElapsedMs).
    const remainingMs = STREAM_SAVE_THROTTLE_MS - idleElapsedMs;
    vi.advanceTimersByTime(remainingMs - 1);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushNow clears a pending timer and flushes immediately", () => {
    const scheduler = makeScheduler();
    scheduler.schedule();
    vi.advanceTimersByTime(0);
    flush.mockClear();

    scheduler.schedule();
    scheduler.flushNow();
    expect(flush).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(IDLE_SAVE_DEBOUNCE_MS);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushIfPending flushes only when a timer is pending", () => {
    const scheduler = makeScheduler();
    scheduler.flushIfPending();
    expect(flush).not.toHaveBeenCalled();

    scheduler.schedule();
    expect(flush).toHaveBeenCalledTimes(1);

    flush.mockClear();
    scheduler.schedule();
    scheduler.flushIfPending();
    expect(flush).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(IDLE_SAVE_DEBOUNCE_MS);
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
