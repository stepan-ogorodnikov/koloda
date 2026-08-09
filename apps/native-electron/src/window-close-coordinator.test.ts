import { afterEach, describe, expect, it, vi } from "vitest";
import { WINDOW_CLOSE_SHUTDOWN_TIMEOUT_MS, createWindowCloseCoordinator } from "./window-close-coordinator";

describe("createWindowCloseCoordinator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defers the first close, requests renderer shutdown, and closes on ack", () => {
    const requestRendererShutdown = vi.fn<() => void>();
    const closeWindow = vi.fn<() => void>();
    const forceCloseWindow = vi.fn<() => void>();

    const coordinator = createWindowCloseCoordinator({
      requestRendererShutdown,
      closeWindow,
      forceCloseWindow,
    });

    expect(coordinator.onCloseAttempt()).toBe("defer");
    expect(requestRendererShutdown).toHaveBeenCalledTimes(1);
    expect(closeWindow).not.toHaveBeenCalled();
    expect(forceCloseWindow).not.toHaveBeenCalled();

    // INVARIANT: Further attempts while awaiting ack stay deferred.
    expect(coordinator.onCloseAttempt()).toBe("defer");
    expect(requestRendererShutdown).toHaveBeenCalledTimes(1);

    coordinator.onShutdownAck();
    expect(closeWindow).toHaveBeenCalledTimes(1);
    expect(forceCloseWindow).not.toHaveBeenCalled();

    expect(coordinator.onCloseAttempt()).toBe("allow");
    expect(closeWindow).toHaveBeenCalledTimes(1);
  });

  it("force-closes after the deadline when ack never arrives", () => {
    vi.useFakeTimers();
    const requestRendererShutdown = vi.fn<() => void>();
    const closeWindow = vi.fn<() => void>();
    const forceCloseWindow = vi.fn<() => void>();

    const coordinator = createWindowCloseCoordinator({
      requestRendererShutdown,
      closeWindow,
      forceCloseWindow,
      timeoutMs: WINDOW_CLOSE_SHUTDOWN_TIMEOUT_MS,
    });

    expect(coordinator.onCloseAttempt()).toBe("defer");
    expect(forceCloseWindow).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WINDOW_CLOSE_SHUTDOWN_TIMEOUT_MS - 1);
    expect(forceCloseWindow).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(forceCloseWindow).toHaveBeenCalledTimes(1);
    expect(closeWindow).not.toHaveBeenCalled();

    expect(coordinator.onCloseAttempt()).toBe("allow");
  });

  it("ignores late ack after force close", () => {
    vi.useFakeTimers();
    const closeWindow = vi.fn<() => void>();
    const forceCloseWindow = vi.fn<() => void>();

    const coordinator = createWindowCloseCoordinator({
      requestRendererShutdown: vi.fn<() => void>(),
      closeWindow,
      forceCloseWindow,
      timeoutMs: 100,
    });

    coordinator.onCloseAttempt();
    vi.advanceTimersByTime(100);
    expect(forceCloseWindow).toHaveBeenCalledTimes(1);

    coordinator.onShutdownAck();
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("dispose clears the force-close timer", () => {
    vi.useFakeTimers();
    const forceCloseWindow = vi.fn<() => void>();

    const coordinator = createWindowCloseCoordinator({
      requestRendererShutdown: vi.fn<() => void>(),
      closeWindow: vi.fn<() => void>(),
      forceCloseWindow,
      timeoutMs: 100,
    });

    coordinator.onCloseAttempt();
    coordinator.dispose();
    vi.advanceTimersByTime(100);
    expect(forceCloseWindow).not.toHaveBeenCalled();
  });
});
