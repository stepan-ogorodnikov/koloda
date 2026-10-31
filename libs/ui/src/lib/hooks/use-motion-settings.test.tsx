import { renderHook } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { motionSettingAtom, useMotionSetting } from "./use-motion-settings";

const device = vi.hoisted(() => ({ isReduced: false }));

vi.mock("motion/react", () => ({ useReducedMotion: () => device.isReduced }));

describe("useMotionSetting", () => {
  // WHY: the twin rows of `wire-ui-preferences.test.ts` (the `motion` class) and `theme-boot.js`; framer animations
  // read this hook, CSS reads the class, and both must agree (INTERFACE-SETTINGS.md §Motion).
  it.each([
    ["on", false, true],
    ["on", true, true],
    ["off", false, false],
    ["off", true, false],
    ["system", false, true],
    ["system", true, false],
  ] as const)("with Motion %s and device reduced motion %s, plays motion: %s", (motion, isReduced, isMotionOn) => {
    device.isReduced = isReduced;
    const store = createStore();
    store.set(motionSettingAtom, motion);

    function Wrapper({ children }: PropsWithChildren) {
      return <JotaiProvider store={store}>{children}</JotaiProvider>;
    }

    const { result } = renderHook(() => useMotionSetting(), { wrapper: Wrapper });
    expect(result.current).toBe(isMotionOn);
  });
});
