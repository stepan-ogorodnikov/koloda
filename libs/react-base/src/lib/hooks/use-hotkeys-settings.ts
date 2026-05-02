import { DEFAULT_HOTKEYS_SETTINGS, hotkeysSettingsValidation } from "@koloda/app";
import type { AppHotkeys } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";

export function useHotkeysSettings(): AppHotkeys {
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({
    ...getSettingsQuery("hotkeys"),
    queryKey: queryKeys.settings.detail("hotkeys"),
  });

  return data?.content
    ? hotkeysSettingsValidation.parse(data.content) as AppHotkeys
    : DEFAULT_HOTKEYS_SETTINGS as AppHotkeys;
}
