import {
  darkThemeAtom,
  dateFormatAtom,
  defaultAlgorithmAtom,
  defaultTemplateAtom,
  langAtom,
  lightThemeAtom,
  schemeAtom,
  timeFormatAtom,
} from "@koloda/core-react";
import { queriesAtom } from "@koloda/core-react";
import { motionSettingAtom } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";

export function useGlobalSync() {
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const { data: learning } = useQuery(getSettingsQuery("learning"));
  const { data } = useQuery(getSettingsQuery("interface"));
  const setDefaultAlgorithm = useSetAtom(defaultAlgorithmAtom);
  const setDefaultTemplate = useSetAtom(defaultTemplateAtom);
  const setScheme = useSetAtom(schemeAtom);
  const setLightTheme = useSetAtom(lightThemeAtom);
  const setDarkTheme = useSetAtom(darkThemeAtom);
  const setDateFormat = useSetAtom(dateFormatAtom);
  const setTimeFormat = useSetAtom(timeFormatAtom);
  const setMotion = useSetAtom(motionSettingAtom);
  const setLang = useSetAtom(langAtom);
  const language = useAtomValue(langAtom);

  useEffect(() => {
    if (learning) {
      setDefaultAlgorithm(learning?.content?.defaults?.algorithm || "");
      setDefaultTemplate(learning?.content?.defaults?.template || "");
    }
  }, [learning, setDefaultAlgorithm, setDefaultTemplate]);

  useEffect(() => {
    if (data) {
      if (data?.content?.scheme) setScheme(data.content.scheme);
      if (data?.content?.lightTheme) setLightTheme(data.content.lightTheme);
      if (data?.content?.darkTheme) setDarkTheme(data.content.darkTheme);
      if (data?.content?.motion) setMotion(data.content.motion);
      if (data?.content?.dateFormat) setDateFormat(data.content.dateFormat);
      if (data?.content?.timeFormat) setTimeFormat(data.content.timeFormat);
      // WHY: interface.language is the authoritative persisted locale — the store
      // boot value is only a pre-setup guess (localStorage / navigator).
      if (data?.content?.language) setLang(data.content.language);
    }
  }, [data, setScheme, setLightTheme, setDarkTheme, setMotion, setDateFormat, setTimeFormat, setLang]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return null;
}
