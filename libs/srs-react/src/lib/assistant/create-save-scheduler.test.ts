import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaveScheduler, IDLE_SAVE_DEBOUNCE_MS, STREAM_SAVE_THROTTLE_MS } from "./create-save-scheduler";
import type { SaveFlushOptions } from "./create-save-scheduler";

describe("createSaveScheduler", () => {
  let flush: ReturnType<typeof vi.fn<(options?: SaveFlushOptions) => void>>;
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
    expect(flush).toHaveBeenCalledWith({ cancelStreamingRuns: true });

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

  it("clamps an idle-then-streaming reschedule into the throttle window", () => {
    const scheduler = makeScheduler();
    scheduler.schedule();
    vi.advanceTimersByTime(0);
    flush.mockClear();

    scheduler.schedule();
    vi.advanceTimersByTime(100);
    isStreaming.mockReturnValue(true);
    scheduler.schedule();
    // Without the clamp, delay would be > throttleMs and miss the window.
    vi.advanceTimersByTime(STREAM_SAVE_THROTTLE_MS);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushNow clears a pending timer and flushes immediately", () => {
    const scheduler = makeScheduler();
    scheduler.schedule();
    vi.advanceTimersByTime(0);
    flush.mockClear();

    scheduler.schedule();
    scheduler.flushNow({ cancelStreamingRuns: true });
    expect(flush).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(IDLE_SAVE_DEBOUNCE_MS);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushIfPending flushes only when a timer is pending", () => {
    const scheduler = makeScheduler();
    scheduler.flushIfPending();
    expect(flush).not.toHaveBeenCalled();

    scheduler.schedule();
    scheduler.flushIfPending();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith({ cancelStreamingRuns: true });

    vi.advanceTimersByTime(IDLE_SAVE_DEBOUNCE_MS);
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
