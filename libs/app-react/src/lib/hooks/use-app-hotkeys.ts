import { LOCALES } from "@koloda/app";
import { langAtom, schemeAtom, useAppHotkey, useHotkeysSettings } from "@koloda/core-react";
import { useInterfaceSettingWrite } from "@koloda/settings-react";
import { focusNext, focusPrev, goToNextTab, goToPrevTab, useMotionSetting } from "@koloda/ui";
import type { HotkeyOptions } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import { useStore } from "jotai";
import { useCallback } from "react";

const SCHEME_CYCLE = ["light", "dark", "system"] as const;
const FOCUS_HOTKEY_OPTIONS: HotkeyOptions = { ignoreInputs: false, conflictBehavior: "allow" };
const TAB_HOTKEY_OPTIONS: HotkeyOptions = { preventDefault: false, conflictBehavior: "allow" };
const TOGGLE_HOTKEY_OPTIONS: HotkeyOptions = { ignoreInputs: false };

export function useAppHotkeys() {
  const { navigation, ui } = useHotkeysSettings();
  const navigate = useNavigate();
  const isMotionOn = useMotionSetting();
  const store = useStore();
  const write = useInterfaceSettingWrite();

  const toggleColorScheme = useCallback(() => {
    const index = SCHEME_CYCLE.indexOf(store.get(schemeAtom) as (typeof SCHEME_CYCLE)[number]);
    write("scheme", SCHEME_CYCLE[(index + 1) % SCHEME_CYCLE.length]);
  }, [store, write]);

  const toggleLanguage = useCallback(() => {
    const index = LOCALES.indexOf(store.get(langAtom));
    write("language", LOCALES[(index + 1) % LOCALES.length]);
  }, [store, write]);

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
