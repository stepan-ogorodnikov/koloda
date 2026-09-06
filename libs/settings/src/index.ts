// Registry mapping each settings row name to its Zod schema. Sits above the
// domain libs: it composes app's shell schemas with ai's provider settings.
import { aiSettingsValidation } from "@koloda/ai";
import {
  hotkeysSettingsValidation,
  interfaceSettingsValidation,
  learningSettingsValidation,
  timestampsValidation,
} from "@koloda/app";
import { z } from "zod";
import type { DeepPartial, Timestamps } from "@koloda/app";

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
