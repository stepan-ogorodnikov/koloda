import type { SettingsName } from "@koloda/srs";

export const settingsQueryKeys = {
  all: () => ["settings"] as const,
  detail: (name: SettingsName) => ["settings", name] as const,
} as const;
