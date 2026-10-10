import { AI_PROVIDERS } from "@koloda/ai";
import type { AIRuntime } from "@koloda/ai";
import {
  addAttachmentFromUrlAtom,
  aiProvidersAtom,
  aiRuntimeAtom,
  appEntryAtom,
  langAtom,
  queriesAtom,
  syncQueriesAtom,
} from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { wireUiPreferences } from "@koloda/app-react";
import { createStore } from "jotai";
import type { WritableAtom } from "jotai";
import { AppEntry } from "../components/app-entry";
import { createElectronAIRuntime } from "./ai-runtime";
import { invoke } from "./electron";
import { activateLanguage, getLanguage } from "./i18n";
import { queriesFn } from "./queries";
import { syncQueries } from "./sync-queries";

export const store = createStore();
export const aiRuntime = createElectronAIRuntime();
export const queries = queriesFn(aiRuntime);

wireUiPreferences(store);

store.sub(langAtom, () => {
  const lang = store.get(langAtom);
  localStorage.setItem("lang", lang);
  activateLanguage(lang);
});

store.set(langAtom, getLanguage());

store.set(queriesAtom as WritableAtom<Queries, [Queries], unknown>, queries);

store.set(aiRuntimeAtom as WritableAtom<AIRuntime, [AIRuntime], unknown>, aiRuntime);

store.set(aiProvidersAtom, [...AI_PROVIDERS]);

store.set(appEntryAtom, { component: AppEntry });

store.set(syncQueriesAtom, syncQueries);

// WHY: jotai treats a function passed to `set` as an updater, so the function value is returned from one.
store.set(addAttachmentFromUrlAtom, () => (url: string) => invoke("cmd_add_attachment_from_url", { url }));
