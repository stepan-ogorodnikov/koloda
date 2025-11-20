import { defaultAlgorithmAtom, defaultTemplateAtom, motionSettingAtom, queriesAtom, themeAtom } from "@koloda/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";

export function useGlobalSync() {
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const { data: learning } = useQuery({ ...getSettingsQuery("learning"), queryKey: ["settings", "learning"] });
  const { data } = useQuery({ ...getSettingsQuery("interface"), queryKey: ["settings", "interface"] });
  const setDefaultAlgorithm = useSetAtom(defaultAlgorithmAtom);
  const setDefaultTemplate = useSetAtom(defaultTemplateAtom);
  const setTheme = useSetAtom(themeAtom);
  const setMotion = useSetAtom(motionSettingAtom);

  useEffect(() => {
    if (learning) {
      setDefaultAlgorithm(learning?.content?.defaults?.algorithm || 0);
      setDefaultTemplate(learning?.content?.defaults?.template || 0);
    }
  }, [learning, setDefaultAlgorithm, setDefaultTemplate]);

  useEffect(() => {
    if (data) {
      if (data?.content?.theme) setTheme(data.content.theme);
      if (data?.content?.motion) setMotion(data.content.motion);
    }
  }, [data, setTheme, setMotion]);

  return null;
}
