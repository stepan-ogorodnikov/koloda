import { queriesAtom, settingsQueryKeys } from "@koloda/react";
import { DEFAULT_HOTKEYS_SETTINGS, objectEntries } from "@koloda/srs";
import type { HotkeyScope, HotkeysSettings } from "@koloda/srs";
import { transformCanonicalToHook } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

type HotkeysSettingsForUseHotkeys = {
  [K in HotkeyScope]: {
    [L in keyof HotkeysSettings[K]]: string;
  };
};

export function useHotkeysSettings(): HotkeysSettingsForUseHotkeys {
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({
    ...getSettingsQuery("hotkeys"),
    queryKey: settingsQueryKeys.detail("hotkeys"),
  });

  const hotkeys = data?.content || DEFAULT_HOTKEYS_SETTINGS;

  return useMemo(() => {
    const result = {} as any;

    for (const [scope, scopeHotkeys] of objectEntries(hotkeys)) {
      result[scope] = {} as any;
      for (const [entryKey, entryValue] of Object.entries(scopeHotkeys)) {
        // transform array of canonical hotkeys to react-hotkeys-hook format as string
        result[scope][entryKey] = entryValue.map(transformCanonicalToHook);
      }
    }

    return result as HotkeysSettingsForUseHotkeys;
  }, [hotkeys]);
}
