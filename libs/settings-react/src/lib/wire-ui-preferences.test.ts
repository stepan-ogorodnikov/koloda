import { schemeAtom } from "@koloda/core-react";
import type * as CoreReact from "@koloda/core-react";
import { motionSettingAtom } from "@koloda/ui";
import { createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UI_PREFERENCES_STORAGE_KEY } from "./ui-preferences-cache";
import { wireUiPreferences } from "./wire-ui-preferences";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

// WHY: siblings here mock `@lingui/react` and `@koloda/core-react` the same way; under `isolate: false` the first file
// to load `@koloda/ui` decides which module it binds to, so this file must not load the real one first.
vi.mock("@koloda/core-react", async (importOriginal) => {
  const actual = await importOriginal<typeof CoreReact>();
  return {
    ...actual,
    useAppHotkey: () => {},
    useHotkeysSettings: () => ({
      ui: { close: ["Escape"] },
      form: { submit: ["Control+Enter"], reset: ["Escape"] },
    }),
  };
});

const DARK_QUERY = "(prefers-color-scheme: dark)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

type MediaListener = (event: MediaQueryListEvent) => void;

// A device whose color scheme and reduced-motion preference the test can flip while the app runs
function stubDevice(initial: { isDark: boolean; isReduced: boolean }) {
  const lists = new Map<string, { matches: boolean; listeners: Set<MediaListener> }>([
    [DARK_QUERY, { matches: initial.isDark, listeners: new Set() }],
    [REDUCED_QUERY, { matches: initial.isReduced, listeners: new Set() }],
  ]);
  window.matchMedia = ((query: string) => {
    const list = lists.get(query)!;
    return {
      get matches() {
        return list.matches;
      },
      media: query,
      addEventListener: (_type: string, listener: MediaListener) => list.listeners.add(listener),
      removeEventListener: (_type: string, listener: MediaListener) => list.listeners.delete(listener),
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;

  return (query: string, matches: boolean) => {
    const list = lists.get(query)!;
    list.matches = matches;
    for (const listener of list.listeners) listener({ matches } as MediaQueryListEvent);
  };
}

const root = document.documentElement;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  localStorage.clear();
  root.className = "";
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("wireUiPreferences", () => {
  it("follows the device live while the scheme is System", () => {
    const setDevice = stubDevice({ isDark: false, isReduced: false });
    wireUiPreferences(createStore());
    expect(root.classList.contains("dark")).toBe(false);

    setDevice(DARK_QUERY, true);
    expect(root.classList.contains("dark")).toBe(true);

    setDevice(DARK_QUERY, false);
    expect(root.classList.contains("dark")).toBe(false);
  });

  it.each([
    ["light", true, false],
    ["dark", false, true],
  ] as const)("keeps %s whatever the device says", (scheme, isDeviceDark, isDark) => {
    const setDevice = stubDevice({ isDark: isDeviceDark, isReduced: false });
    const store = createStore();
    wireUiPreferences(store);
    store.set(schemeAtom, scheme);
    expect(root.classList.contains("dark")).toBe(isDark);

    setDevice(DARK_QUERY, !isDeviceDark);
    expect(root.classList.contains("dark")).toBe(isDark);
  });

  it.each([
    ["on", false, true],
    ["on", true, true],
    ["off", false, false],
    ["off", true, false],
    ["system", false, true],
    ["system", true, false],
  ] as const)("with Motion %s and device reduced motion %s, plays motion: %s", (motion, isReduced, isMotionOn) => {
    stubDevice({ isDark: false, isReduced });
    const store = createStore();
    wireUiPreferences(store);
    store.set(motionSettingAtom, motion);

    expect(root.classList.contains("motion")).toBe(isMotionOn);
  });

  it("re-reads reduced motion when the device changes it under System", () => {
    const setDevice = stubDevice({ isDark: false, isReduced: false });
    wireUiPreferences(createStore());
    expect(root.classList.contains("motion")).toBe(true);

    setDevice(REDUCED_QUERY, true);
    expect(root.classList.contains("motion")).toBe(false);
  });

  it("writes the device cache only with all four values set", () => {
    stubDevice({ isDark: false, isReduced: false });
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    wireUiPreferences(createStore());

    const writes = setItem.mock.calls
      .filter(([key]) => key === UI_PREFERENCES_STORAGE_KEY)
      .map(([, value]) => JSON.parse(value));
    expect(writes.length).toBeGreaterThan(0);
    for (const written of writes) {
      expect(written).toEqual({
        scheme: "system",
        lightTheme: "github-light",
        darkTheme: "github-dark",
        motion: "system",
      });
    }
  });
});
