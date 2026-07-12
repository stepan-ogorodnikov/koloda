import {
  darkThemeAtom,
  defaultAlgorithmAtom,
  defaultTemplateAtom,
  langAtom,
  lightThemeAtom,
  schemeAtom,
} from "@koloda/core-react";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { motionSettingAtom } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";

export function useGlobalSync() {
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const { data: learning } = useQuery({
    ...getSettingsQuery("learning"),
    queryKey: queryKeys.settings.detail("learning"),
  });
  const { data } = useQuery({ ...getSettingsQuery("interface"), queryKey: queryKeys.settings.detail("interface") });
  const setDefaultAlgorithm = useSetAtom(defaultAlgorithmAtom);
  const setDefaultTemplate = useSetAtom(defaultTemplateAtom);
  const setScheme = useSetAtom(schemeAtom);
  const setLightTheme = useSetAtom(lightThemeAtom);
  const setDarkTheme = useSetAtom(darkThemeAtom);
  const setMotion = useSetAtom(motionSettingAtom);
  const language = useAtomValue(langAtom);

  useEffect(() => {
    if (learning) {
      setDefaultAlgorithm(learning?.content?.defaults?.algorithm || 0);
      setDefaultTemplate(learning?.content?.defaults?.template || 0);
    }
  }, [learning, setDefaultAlgorithm, setDefaultTemplate]);

  useEffect(() => {
    if (data) {
      if (data?.content?.scheme) setScheme(data.content.scheme);
      if (data?.content?.lightTheme) setLightTheme(data.content.lightTheme);
      if (data?.content?.darkTheme) setDarkTheme(data.content.darkTheme);
      if (data?.content?.motion) setMotion(data.content.motion);
    }
  }, [data, setScheme, setLightTheme, setDarkTheme, setMotion]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return null;
}
