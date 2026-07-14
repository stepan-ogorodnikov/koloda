import { aiProvidersAtom, appEntryAtom, langAtom, queriesAtom, schemeAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { wireUiPreferences } from "@koloda/app-react";
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

store.sub(schemeAtom, () => {
  localStorage.setItem("scheme", store.get(schemeAtom));
});

wireUiPreferences(store);

store.set(langAtom, getLanguage());

store.set(queriesAtom as WritableAtom<Queries, [Queries], unknown>, queries);

store.set(aiProvidersAtom, ["openrouter", "ollama", "lmstudio", "opencodeGo", "opencodeZen"]);

store.set(appEntryAtom, { component: DemoAppEntry });
