import { useHotkeysSettings } from "@koloda/react-base";
import { useAppHotkey } from "@koloda/react-base";
import { focusNext, focusPrev, goToNextTab, goToPrevTab } from "@koloda/ui";
import { useNavigate } from "@tanstack/react-router";

export function useAppHotkeys() {
  const { navigation, ui } = useHotkeysSettings();
  const navigate = useNavigate();
  useAppHotkey(navigation.dashboard, () => navigate({ to: "/dashboard" }), "nav");
  useAppHotkey(navigation.decks, () => navigate({ to: "/decks" }), "nav");
  useAppHotkey(navigation.algorithms, () => navigate({ to: "/algorithms" }), "nav");
  useAppHotkey(navigation.templates, () => navigate({ to: "/templates" }), "nav");
  useAppHotkey(navigation.settings, () => navigate({ to: "/settings" }), "nav");
  useAppHotkey(ui.focusNext, focusNext, "", { ignoreInputs: false });
  useAppHotkey(ui.focusPrev, focusPrev, "", { ignoreInputs: false });
  useAppHotkey(ui.nextTab, goToNextTab, "");
  useAppHotkey(ui.prevTab, goToPrevTab, "");

  return null;
}
