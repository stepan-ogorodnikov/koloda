import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
