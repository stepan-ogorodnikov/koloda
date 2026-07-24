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

vi.mock("@koloda/core-react", async () => {
  const { useEffect } = await import("react");
  const { matchesAnyHotkey } = await import("./lib/core/hotkeys");

  return {
    useAppHotkey: (
      hotkeys: Parameters<typeof matchesAnyHotkey>[1],
      callback: (event: KeyboardEvent) => void,
      _scope: string,
      options?: { target?: EventTarget | null },
    ) => {
      useEffect(() => {
        const target = (options?.target ?? document) as Document | HTMLElement;
        if (typeof target.addEventListener !== "function") return;

        // Guard against re-entrancy: the real select hotkey callback dispatches the same
        // key onto the listbox, which would otherwise retrigger this listener forever.
        let isHandling = false;
        const handler = (event: Event) => {
          if (isHandling) return;
          const keyboardEvent = event as KeyboardEvent;
          if (!matchesAnyHotkey(keyboardEvent, hotkeys ?? [])) return;

          isHandling = true;
          try {
            callback(keyboardEvent);
          } finally {
            isHandling = false;
          }
        };

        target.addEventListener("keydown", handler);
        return () => target.removeEventListener("keydown", handler);
      }, [callback, hotkeys, options?.target]);
    },
    useHotkeysSettings: () => ({
      ui: {
        close: ["Escape"],
        // Use non-arrow bindings so the mock can dispatch ArrowDown/Up once for RAC
        // without double-handling the same key as the listbox's native navigation.
        focusNext: ["j"],
        focusPrev: ["k"],
        toggleSidebarControls: [],
      },
      forms: {
        submit: [],
        reset: [],
      },
    }),
    useHotkeysStatus: () => ({
      disableScope: () => {},
      enableScope: () => {},
      scopes: {},
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
