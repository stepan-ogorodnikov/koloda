import { aiSettingsValidation } from "@koloda/ai";
import { z } from "zod";
import { timestampsValidation } from "./db";
import type { Timestamps } from "./db";
import { hotkeysSettingsValidation } from "./settings-hotkeys";
import { interfaceSettingsValidation } from "./settings-interface";
import { learningSettingsValidation } from "./settings-learning";
import type { DeepPartial } from "./utility";

export const allowedSettings = {
  interface: interfaceSettingsValidation,
  learning: learningSettingsValidation,
  hotkeys: hotkeysSettingsValidation,
  ai: aiSettingsValidation,
} as const;

export type SettingsName = keyof typeof allowedSettings;

export type SettingsContent<T extends SettingsName> = z.input<(typeof allowedSettings)[T]>;

export type AllowedSettings<T extends SettingsName> = Timestamps & {
  id: number;
  name: T;
  content: SettingsContent<T>;
};

/** Row envelope before content is re-parsed for defaults. */
export const settingsRowEnvelopeSchema = z.object({
  id: z.int(),
  name: z.string(),
  content: z.unknown(),
  ...timestampsValidation.shape,
});

export function settingsRowSchema<T extends SettingsName>(name: T) {
  return z.object({
    id: z.int(),
    name: z.literal(name),
    content: allowedSettings[name],
    ...timestampsValidation.shape,
  });
}

export type SetSettingsData<T extends SettingsName> = {
  name: SettingsName;
  content: SettingsContent<T>;
};

export type PatchSettingsData<T extends SettingsName> = {
  name: SettingsName;
  content: DeepPartial<SettingsContent<T>>;
};
