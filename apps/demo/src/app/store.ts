import { appEntryAtom, langAtom, motionSettingAtom, queriesAtom, themeAtom } from "@koloda/react";
import type { Queries } from "@koloda/react";
import { hotkeysScopesAtom } from "@koloda/ui";
import { createStore } from "jotai";
import type { WritableAtom } from "jotai";
import { DemoAppEntry } from "../components/demo-app-entry";
import { db } from "./db";
import { activateLanguage, getLanguage } from "./i18n";
import { queriesFn } from "./queries";

export const store = createStore();
export const queries = queriesFn(db);

store.sub(langAtom, () => {
  const lang = store.get(langAtom);
  localStorage.setItem("lang", lang);
  activateLanguage(lang);
});

store.set(langAtom, getLanguage());

store.sub(themeAtom, () => {
  const theme = store.get(themeAtom);
  localStorage.setItem("theme", theme);
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

store.set(motionSettingAtom, "system");

store.set(hotkeysScopesAtom, []);

store.set(queriesAtom as WritableAtom<Queries, [Queries], unknown>, queries);

store.set(appEntryAtom, { component: DemoAppEntry });
