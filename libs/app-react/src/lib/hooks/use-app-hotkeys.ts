import type { AllowedSettings } from "@koloda/app";
import { queriesAtom, queryKeys, themeAtom, useAppHotkey, useHotkeysSettings } from "@koloda/core-react";
import { focusNext, focusPrev, goToNextTab, goToPrevTab, useMotionSetting } from "@koloda/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";

const THEME_CYCLE = ["light", "dark", "system"] as const;

export function useAppHotkeys() {
  const { navigation, ui } = useHotkeysSettings();
  const navigate = useNavigate();
  const isMotionOn = useMotionSetting();
  const setTheme = useSetAtom(themeAtom);
  const { patchSettingsMutation } = useAtomValue(queriesAtom);
  const queryClient = useQueryClient();
  const { mutate: persistTheme } = useMutation({
    onSuccess: (settings: AllowedSettings<"interface"> | undefined) => {
      queryClient.setQueryData(queryKeys.settings.detail("interface"), settings);
    },
    ...patchSettingsMutation(),
  });

  const toggleColorScheme = useCallback(() => {
    setTheme((current) => {
      const index = THEME_CYCLE.indexOf(current as typeof THEME_CYCLE[number]);
      const next = THEME_CYCLE[(index + 1) % THEME_CYCLE.length];
      persistTheme({ name: "interface", content: { theme: next } });
      return next;
    });
  }, [persistTheme, setTheme]);

  useAppHotkey(navigation.dashboard, () => navigate({ to: "/dashboard", viewTransition: isMotionOn }), "nav");
  useAppHotkey(navigation.decks, () => navigate({ to: "/decks", viewTransition: isMotionOn }), "nav");
  useAppHotkey(navigation.algorithms, () => navigate({ to: "/algorithms", viewTransition: isMotionOn }), "nav");
  useAppHotkey(navigation.templates, () => navigate({ to: "/templates", viewTransition: isMotionOn }), "nav");
  useAppHotkey(navigation.settings, () => navigate({ to: "/settings", viewTransition: isMotionOn }), "nav");
  useAppHotkey(navigation.ai, () => navigate({ to: "/ai", viewTransition: isMotionOn }), "nav");
  useAppHotkey(ui.focusNext, focusNext, "", { ignoreInputs: false, conflictBehavior: "allow" });
  useAppHotkey(ui.focusPrev, focusPrev, "", { ignoreInputs: false, conflictBehavior: "allow" });
  useAppHotkey(ui.nextTab, goToNextTab, "", { preventDefault: false, conflictBehavior: "allow" });
  useAppHotkey(ui.prevTab, goToPrevTab, "", { preventDefault: false, conflictBehavior: "allow" });
  useAppHotkey(ui.toggleColorScheme, toggleColorScheme, "", { ignoreInputs: false });

  return null;
}
