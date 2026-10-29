import type { AIRuntime } from "@koloda/ai";
import { coerceConversationState, upsertConversationAtom } from "@koloda/assistant-react";
import { aiRuntimeAtom, langAtom, queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { wireUiPreferences } from "@koloda/settings-react";
import { createStore } from "jotai";
import type { WritableAtom } from "jotai";
import { aiRuntime } from "./ai-runtime";
import { IN_PROGRESS_CONVERSATION } from "./assistant-samples";
import { activateLanguage, getLanguage } from "./i18n";
import { queries } from "./queries";

export const store = createStore();

// WHY: the in-progress sample is live, so it goes in the store rather than through restore. Restore interrupts
// a streaming run, and a store entry is kept as it is.
const inProgressRestore = coerceConversationState(IN_PROGRESS_CONVERSATION.state);
if (inProgressRestore.status !== "ok")
  throw new Error(`In-progress sample did not restore: ${inProgressRestore.status}`);
store.set(upsertConversationAtom, inProgressRestore.state);

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
