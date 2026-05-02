import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Mock ResizeObserver for @dnd-kit/dom (required by ToggleGroup)
global.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
