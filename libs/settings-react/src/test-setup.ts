import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// WORKAROUND: jsdom lacks ResizeObserver, which @dnd-kit/dom requires via ToggleGroup.
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
