import { LOCALES } from "@koloda/app";
import type { AllowedSettings } from "@koloda/settings";
import { langAtom, queriesAtom, queryKeys, schemeAtom, useAppHotkey, useHotkeysSettings } from "@koloda/core-react";
import { focusNext, focusPrev, goToNextTab, goToPrevTab, useMotionSetting } from "@koloda/ui";
import type { HotkeyOptions } from "@tanstack/react-hotkeys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";

const SCHEME_CYCLE = ["light", "dark", "system"] as const;
const FOCUS_HOTKEY_OPTIONS: HotkeyOptions = { ignoreInputs: false, conflictBehavior: "allow" };
const TAB_HOTKEY_OPTIONS: HotkeyOptions = { preventDefault: false, conflictBehavior: "allow" };
const TOGGLE_HOTKEY_OPTIONS: HotkeyOptions = { ignoreInputs: false };

export function useAppHotkeys() {
  const { navigation, ui } = useHotkeysSettings();
  const navigate = useNavigate();
  const isMotionOn = useMotionSetting();
  const setScheme = useSetAtom(schemeAtom);
  const setLang = useSetAtom(langAtom);
  const { patchSettingsMutation } = useAtomValue(queriesAtom);
  const queryClient = useQueryClient();
  const { mutate: persistInterface } = useMutation({
    onSuccess: (settings: AllowedSettings<"interface"> | undefined) => {
      queryClient.setQueryData(queryKeys.settings.detail("interface"), settings);
    },
    ...patchSettingsMutation(),
  });

  const toggleColorScheme = useCallback(() => {
    setScheme((current) => {
      const index = SCHEME_CYCLE.indexOf(current as (typeof SCHEME_CYCLE)[number]);
      const next = SCHEME_CYCLE[(index + 1) % SCHEME_CYCLE.length];
      persistInterface({ name: "interface", content: { scheme: next } });
      return next;
    });
  }, [persistInterface, setScheme]);

  const toggleLanguage = useCallback(() => {
    setLang((current) => {
      const index = LOCALES.indexOf(current);
      const next = LOCALES[(index + 1) % LOCALES.length];
      persistInterface({ name: "interface", content: { language: next } });
      return next;
    });
  }, [persistInterface, setLang]);

  useAppHotkey(navigation.dashboard, () => navigate({ to: "/dashboard", viewTransition: isMotionOn }), "navigation");
  useAppHotkey(navigation.decks, () => navigate({ to: "/decks", viewTransition: isMotionOn }), "navigation");
  useAppHotkey(navigation.algorithms, () => navigate({ to: "/algorithms", viewTransition: isMotionOn }), "navigation");
  useAppHotkey(navigation.templates, () => navigate({ to: "/templates", viewTransition: isMotionOn }), "navigation");
  useAppHotkey(navigation.settings, () => navigate({ to: "/settings", viewTransition: isMotionOn }), "navigation");
  useAppHotkey(navigation.ai, () => navigate({ to: "/ai", viewTransition: isMotionOn }), "navigation");
  useAppHotkey(ui.focusNext, focusNext, "", FOCUS_HOTKEY_OPTIONS);
  useAppHotkey(ui.focusPrev, focusPrev, "", FOCUS_HOTKEY_OPTIONS);
  useAppHotkey(ui.nextTab, goToNextTab, "", TAB_HOTKEY_OPTIONS);
  useAppHotkey(ui.prevTab, goToPrevTab, "", TAB_HOTKEY_OPTIONS);
  useAppHotkey(ui.toggleColorScheme, toggleColorScheme, "", TOGGLE_HOTKEY_OPTIONS);
  useAppHotkey(ui.toggleLanguage, toggleLanguage, "", TOGGLE_HOTKEY_OPTIONS);

  return null;
}
