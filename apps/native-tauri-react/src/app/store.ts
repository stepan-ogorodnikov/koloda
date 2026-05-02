import { aiProvidersAtom, appEntryAtom, langAtom, themeAtom } from "@koloda/react-base";
import type { Queries } from "@koloda/react-base";
import { DEFAULT_HOTKEYS_SCOPES, hotkeysScopesAtom, queriesAtom } from "@koloda/react-base";
import { motionSettingAtom } from "@koloda/ui";
import { createStore } from "jotai";
import type { WritableAtom } from "jotai";
import { AppEntry } from "../components/app-entry";
import { activateLanguage, getLanguage } from "./i18n";
import { queriesFn } from "./queries";
import "../services/ai-provider-registration";

export const store = createStore();
export const queries = queriesFn();

store.sub(langAtom, () => {
  const lang = store.get(langAtom);
  activateLanguage(lang);
});

store.set(langAtom, getLanguage());

store.sub(themeAtom, () => {
  const prefersQuery = window.matchMedia("(prefers-color-scheme: dark)");
  onPrefersColorSchemeChange(prefersQuery);
  prefersQuery.addEventListener("change", onPrefersColorSchemeChange);

  return () => {
    prefersQuery.removeEventListener("change", onPrefersColorSchemeChange);
  };
});

function onPrefersColorSchemeChange(e: MediaQueryListEvent | MediaQueryList) {
  const theme = store.get(themeAtom);
  const value = e.matches
    ? (theme === "light" ? "light" : "dark")
    : (theme === "dark" ? "dark" : "light");
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(value);
}

store.set(themeAtom, "system");

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

store.set(motionSettingAtom, "system");

store.set(hotkeysScopesAtom, DEFAULT_HOTKEYS_SCOPES);

store.set(queriesAtom as WritableAtom<Queries, [Queries], unknown>, queries);

store.set(aiProvidersAtom, ["openrouter", "ollama", "lmstudio", "codex"]);

store.set(appEntryAtom, { component: AppEntry });
