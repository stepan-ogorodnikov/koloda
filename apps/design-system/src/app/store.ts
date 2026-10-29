import type { AIRuntime } from "@koloda/ai";
import { aiRuntimeAtom, langAtom, queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { wireUiPreferences } from "@koloda/settings-react";
import { createStore } from "jotai";
import type { WritableAtom } from "jotai";
import { aiRuntime } from "./ai-runtime";
import { activateLanguage, getLanguage } from "./i18n";
import { queries } from "./queries";

export const store = createStore();

store.sub(langAtom, () => {
  const lang = store.get(langAtom);
  localStorage.setItem("lang", lang);
  document.documentElement.lang = lang;
  activateLanguage(lang);
});

wireUiPreferences(store);

store.set(langAtom, getLanguage());

store.set(queriesAtom as WritableAtom<Queries, [Queries], unknown>, queries);

store.set(aiRuntimeAtom as WritableAtom<AIRuntime, [AIRuntime], unknown>, aiRuntime);
