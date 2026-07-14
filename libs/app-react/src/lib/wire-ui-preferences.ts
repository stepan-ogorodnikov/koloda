import {
  darkThemeAtom,
  DEFAULT_HOTKEYS_SCOPES,
  hotkeysScopesAtom,
  lightThemeAtom,
  schemeAtom,
} from "@koloda/core-react";
import { motionSettingAtom } from "@koloda/ui";
import type { createStore } from "jotai";

type Store = ReturnType<typeof createStore>;

export type WireUiPreferencesOptions = {
  scheme?: string;
  lightTheme?: string;
  darkTheme?: string;
  motion?: string;
};

export function wireUiPreferences(store: Store, options: WireUiPreferencesOptions = {}) {
  const { scheme = "system", lightTheme = "atom-one-light", darkTheme = "atom-one-dark", motion = "system" } = options;

  store.sub(schemeAtom, () => {
    const prefersQuery = window.matchMedia("(prefers-color-scheme: dark)");
    onPrefersColorSchemeChange(prefersQuery);
    prefersQuery.addEventListener("change", onPrefersColorSchemeChange);

    return () => {
      prefersQuery.removeEventListener("change", onPrefersColorSchemeChange);
    };
  });

  function onPrefersColorSchemeChange(e: MediaQueryListEvent | MediaQueryList) {
    const current = store.get(schemeAtom);
    const value = e.matches ? (current === "light" ? "light" : "dark") : current === "dark" ? "dark" : "light";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(value);
  }

  store.set(schemeAtom, scheme);

  store.sub(lightThemeAtom, () => {
    document.documentElement.dataset.lightTheme = store.get(lightThemeAtom);
  });

  store.sub(darkThemeAtom, () => {
    document.documentElement.dataset.darkTheme = store.get(darkThemeAtom);
  });

  store.set(lightThemeAtom, lightTheme);
  store.set(darkThemeAtom, darkTheme);

  store.sub(motionSettingAtom, () => {
    const prefersQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    onReducedMotionChange(prefersQuery);
    prefersQuery.addEventListener("change", onReducedMotionChange);

    return () => {
      prefersQuery.removeEventListener("change", onReducedMotionChange);
    };
  });

  function onReducedMotionChange(e: MediaQueryListEvent | MediaQueryList) {
    const motionSetting = store.get(motionSettingAtom);
    const isOn = e.matches ? motionSetting === "on" : motionSetting !== "off";
    document.documentElement.classList[isOn ? "add" : "remove"]("motion");
  }

  store.set(motionSettingAtom, motion);

  store.set(hotkeysScopesAtom, DEFAULT_HOTKEYS_SCOPES);
}
