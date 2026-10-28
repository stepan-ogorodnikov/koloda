import { langAtom, queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { createStore } from "jotai";
import type { WritableAtom } from "jotai";
import { queries } from "./queries";
import { applyTheme, themeAtom, writeThemeParam } from "./theme";

export const store = createStore();

store.sub(themeAtom, () => {
  const id = store.get(themeAtom);
  applyTheme(id);
  writeThemeParam(id);
});

store.set(langAtom, "en");

store.set(queriesAtom as WritableAtom<Queries, [Queries], unknown>, queries);
