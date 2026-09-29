import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// WHY: NumberFlow's custom element crashes in jsdom on re-render; the slider's
// animated digits are not under test. A file-level mock does not apply once a
// sibling has imported @koloda/ui, which loads the real module through the slider.
vi.mock("@number-flow/react", async () => {
  const { createElement } = await import("react");
  return {
    default: (props: { value?: unknown }) => createElement("span", null, String(props.value)),
  };
});

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
