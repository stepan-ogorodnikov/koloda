import { aiProvidersAtom, appEntryAtom, langAtom, queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { wireUiPreferences } from "@koloda/app-react";
import { createStore } from "jotai";
import type { WritableAtom } from "jotai";
import { AppEntry } from "../components/app-entry";
import { activateLanguage, getLanguage } from "./i18n";
import { queriesFn } from "./queries";

export const store = createStore();
export const queries = queriesFn();

wireUiPreferences(store);

store.sub(langAtom, () => {
  const lang = store.get(langAtom);
  activateLanguage(lang);
});

store.set(langAtom, getLanguage());

store.set(queriesAtom as WritableAtom<Queries, [Queries], unknown>, queries);

store.set(aiProvidersAtom, ["openrouter", "ollama", "lmstudio", "opencodeGo", "opencodeZen"]);

store.set(appEntryAtom, { component: AppEntry });
