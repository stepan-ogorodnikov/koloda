import type { AIRuntime } from "@koloda/ai";
import { aiRuntimeAtom, langAtom, queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { createStore } from "jotai";
import type { WritableAtom } from "jotai";
import { aiRuntime } from "./ai-runtime";
import { queries } from "./queries";
import { applyTheme, storeTheme, themeAtom } from "./theme";

export const store = createStore();

store.sub(themeAtom, () => {
  const id = store.get(themeAtom);
  applyTheme(id);
  storeTheme(id);
});

store.set(langAtom, "en");

store.set(queriesAtom as WritableAtom<Queries, [Queries], unknown>, queries);

store.set(aiRuntimeAtom as WritableAtom<AIRuntime, [AIRuntime], unknown>, aiRuntime);
