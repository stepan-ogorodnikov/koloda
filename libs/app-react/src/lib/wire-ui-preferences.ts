import {
  darkThemeAtom,
  DEFAULT_HOTKEYS_SCOPES,
  hotkeysScopesAtom,
  lightThemeAtom,
  schemeAtom,
} from "@koloda/core-react";
import { motionSettingAtom } from "@koloda/ui";
import type { createStore } from "jotai";
import { readUiPreferencesCache, writeUiPreferencesCache } from "./ui-preferences-cache";

type Store = ReturnType<typeof createStore>;

export type WireUiPreferencesOptions = {
  scheme?: string;
  lightTheme?: string;
  darkTheme?: string;
  motion?: string;
};

export function wireUiPreferences(store: Store, options: WireUiPreferencesOptions = {}) {
  const cached = readUiPreferencesCache();
  const {
    scheme = cached?.scheme ?? "system",
    lightTheme = cached?.lightTheme ?? "atom-one-light",
    darkTheme = cached?.darkTheme ?? "atom-one-dark",
    motion = cached?.motion ?? "system",
  } = options;

  const prefersColorScheme = window.matchMedia("(prefers-color-scheme: dark)");

  function onPrefersColorSchemeChange(e: MediaQueryListEvent | MediaQueryList) {
    const current = store.get(schemeAtom);
    const value = e.matches ? (current === "light" ? "light" : "dark") : current === "dark" ? "dark" : "light";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(value);
  }

  prefersColorScheme.addEventListener("change", onPrefersColorSchemeChange);

  store.sub(schemeAtom, () => {
    onPrefersColorSchemeChange(prefersColorScheme);
    persistCache(store);
  });

  store.set(schemeAtom, scheme);

  store.sub(lightThemeAtom, () => {
    document.documentElement.dataset.lightTheme = store.get(lightThemeAtom);
    persistCache(store);
  });

  store.sub(darkThemeAtom, () => {
    document.documentElement.dataset.darkTheme = store.get(darkThemeAtom);
    persistCache(store);
  });

  store.set(lightThemeAtom, lightTheme);
  store.set(darkThemeAtom, darkTheme);

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function onReducedMotionChange(e: MediaQueryListEvent | MediaQueryList) {
    const motionSetting = store.get(motionSettingAtom);
    const isOn = e.matches ? motionSetting === "on" : motionSetting !== "off";
    document.documentElement.classList[isOn ? "add" : "remove"]("motion");
  }

  prefersReducedMotion.addEventListener("change", onReducedMotionChange);

  store.sub(motionSettingAtom, () => {
    onReducedMotionChange(prefersReducedMotion);
    persistCache(store);
  });

  store.set(motionSettingAtom, motion);

  // WHY: theme-boot.js sets an inline surface color before CSS; drop it once tokens apply
  document.documentElement.style.removeProperty("background-color");
  document.documentElement.style.removeProperty("color-scheme");

  store.set(hotkeysScopesAtom, DEFAULT_HOTKEYS_SCOPES);
}

function persistCache(store: Store) {
  const scheme = store.get(schemeAtom);
  const lightTheme = store.get(lightThemeAtom);
  const darkTheme = store.get(darkThemeAtom);
  const motion = store.get(motionSettingAtom);
  // WHY: store.sub fires on each partial store.set during wiring; empty atom defaults
  // make this skip until all four are set so we don't merge "" into koloda-ui-prefs.
  if (!scheme || !lightTheme || !darkTheme || !motion) return;
  writeUiPreferencesCache({ scheme, lightTheme, darkTheme, motion });
}
