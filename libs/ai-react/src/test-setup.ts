import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

global.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

if (typeof CSS === "undefined") {
  // @ts-expect-error jsdom may omit CSS
  global.CSS = {};
}
if (typeof CSS.escape !== "function") {
  CSS.escape = (value: string) =>
    String(value).replace(
      // WHY: jsdom lacks CSS.escape, so we polyfill it. The C0/C1 control ranges are required to match
      // the CSS-illegal characters a real `CSS.escape` would escape.
      // oxlint-disable-next-line no-control-regex
      /[\0-\x1f\x7f-\x9f!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g,
      (ch) => `\\${ch}`,
    );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
