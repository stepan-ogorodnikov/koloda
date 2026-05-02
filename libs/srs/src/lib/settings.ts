import { aiSettingsValidation } from "@koloda/ai";
import type { DeepPartial, Timestamps } from "@koloda/app";
import { interfaceSettingsValidation } from "@koloda/app";
import type { z } from "zod";
import { hotkeysSettingsValidation } from "./settings-hotkeys";
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
