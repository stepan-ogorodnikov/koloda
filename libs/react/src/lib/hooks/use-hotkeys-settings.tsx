import { queriesAtom, settingsQueryKeys } from "@koloda/react";
import { DEFAULT_HOTKEYS_SETTINGS } from "@koloda/srs";
import type { AppHotkeys } from "@koloda/srs";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";

export function useHotkeysSettings(): AppHotkeys {
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({
    ...getSettingsQuery("hotkeys"),
    queryKey: settingsQueryKeys.detail("hotkeys"),
  });

  return (data?.content || DEFAULT_HOTKEYS_SETTINGS) as unknown as AppHotkeys;
}
