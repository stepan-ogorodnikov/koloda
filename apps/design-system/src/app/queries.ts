import { queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";

const settingsOnly: Pick<Queries, "getSettingsQuery"> = {
  getSettingsQuery: (name) => ({
    queryKey: queryKeys.settings.detail(name),
    queryFn: () => null,
  }),
};

// WHY: the app has no database. A null settings row makes `useHotkeysSettings` fall back to the defaults.
// Every other method throws with its name, so a component that needs data fails loudly.
// Only `*Query` and `*Mutation` keys become methods, because jotai probes a stored value for `then`.
export const queries = new Proxy(settingsOnly as Queries, {
  get(target, key) {
    if (key in target) return Reflect.get(target, key);
    if (typeof key !== "string" || !/(Query|Mutation)$/.test(key)) return undefined;
    return () => {
      throw new Error(`The design system app has no data for ${key}`);
    };
  },
});
