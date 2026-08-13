import type { AIRuntime } from "@koloda/ai";
import { listProvidersThatWorkInBrowser } from "@koloda/ai";
import { aiProvidersAtom, aiRuntimeAtom, appEntryAtom, langAtom, queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { wireUiPreferences } from "@koloda/app-react";
import { createStore } from "jotai";
import type { WritableAtom } from "jotai";
import { DemoAppEntry } from "../components/demo-app-entry";
import { createDemoAIRuntime } from "./ai-runtime";
import { db } from "./db";
import { activateLanguage, getLanguage } from "./i18n";
import { queriesFn } from "./queries";

export const store = createStore();
export const aiRuntime = createDemoAIRuntime(db);
export const queries = queriesFn(db, aiRuntime);

store.sub(langAtom, () => {
  const lang = store.get(langAtom);
  localStorage.setItem("lang", lang);
  activateLanguage(lang);
});

wireUiPreferences(store);

store.set(langAtom, getLanguage());

store.set(queriesAtom as WritableAtom<Queries, [Queries], unknown>, queries);

store.set(aiRuntimeAtom as WritableAtom<AIRuntime, [AIRuntime], unknown>, aiRuntime);

store.set(aiProvidersAtom, listProvidersThatWorkInBrowser());

store.set(appEntryAtom, { component: DemoAppEntry });
