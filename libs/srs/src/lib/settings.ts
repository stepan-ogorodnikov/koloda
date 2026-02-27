import type { DeepPartial, Timestamps } from "@koloda/srs";
import type { z } from "zod";
import { aiSettingsValidation } from "./settings-ai";
import { hotkeysSettingsValidation } from "./settings-hotkeys";
import { interfaceSettingsValidation } from "./settings-interface";
import { learningSettingsValidation } from "./settings-learning";

export const allowedSettings = {
  interface: interfaceSettingsValidation,
  learning: learningSettingsValidation,
  hotkeys: hotkeysSettingsValidation,
  ai: aiSettingsValidation,
} as const;

export type SettingsName = keyof typeof allowedSettings;

export type SettingsContent<T extends SettingsName> = z.input<typeof allowedSettings[T]>;

export type AllowedSettings<T extends SettingsName> = Timestamps & {
  id: number;
  name: T;
  content: SettingsContent<T>;
};

export type SetSettingsData<T extends SettingsName> = {
  name: SettingsName;
  content: SettingsContent<T>;
};

export type PatchSettingsData<T extends SettingsName> = {
  name: SettingsName;
  content: DeepPartial<SettingsContent<T>>;
};
