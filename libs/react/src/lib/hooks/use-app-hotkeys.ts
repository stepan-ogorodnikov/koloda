import { useHotkeysSettings } from "@koloda/react";
import { useNavigate } from "@tanstack/react-router";
import { useAppHotkey } from "./use-app-hotkey";

export function useAppHotkeys() {
  const { navigation } = useHotkeysSettings();
  const navigate = useNavigate();
  useAppHotkey(navigation.dashboard, () => navigate({ to: "/dashboard" }), "nav");
  useAppHotkey(navigation.decks, () => navigate({ to: "/decks" }), "nav");
  useAppHotkey(navigation.algorithms, () => navigate({ to: "/algorithms" }), "nav");
  useAppHotkey(navigation.templates, () => navigate({ to: "/templates" }), "nav");
  useAppHotkey(navigation.settings, () => navigate({ to: "/settings" }), "nav");

  return null;
}
