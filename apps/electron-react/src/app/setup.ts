import type { InterfaceSettings } from "@koloda/app";
import { DEFAULT_INTERFACE_SETTINGS } from "@koloda/app";
import { DEFAULT_HOTKEYS_SETTINGS } from "@koloda/app";
import { DEFAULT_LEARNING_SETTINGS } from "@koloda/app";
import type { DbStatus, SeedDbData, SyncStarter } from "@koloda/native-ipc";
import { DEFAULT_FSRS_ALGORITHM, DEFAULT_TEMPLATE } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import type { I18nContext } from "@lingui/react";
import { invoke } from "./electron";

export async function getStatus(): Promise<DbStatus> {
  return invoke("get_db_status", undefined);
}

type seedParams = Partial<InterfaceSettings> & { t: I18nContext["_"] };

// INVARIANT: the first-run seed and the rows sync repair creates when none is left are the same starter content.
export function starterContent(t: I18nContext["_"]): SyncStarter {
  const title = t(msg`app.setup.default-title`);
  return {
    algorithm: { title, content: DEFAULT_FSRS_ALGORITHM },
    template: { ...DEFAULT_TEMPLATE, title },
  };
}

// INVARIANT: a blank database gets the same settings whether it is seeded or joins a space.
export function seedSettings(settings: Partial<InterfaceSettings>): SeedDbData["settings"] {
  return {
    interface: { ...DEFAULT_INTERFACE_SETTINGS, ...settings },
    learning: DEFAULT_LEARNING_SETTINGS,
    hotkeys: DEFAULT_HOTKEYS_SETTINGS,
  };
}

export async function seedDB({ t, ...settings }: seedParams): Promise<void> {
  const status = await getStatus();
  if (status === "ok") return;

  const data: SeedDbData = {
    ...starterContent(t),
    settings: seedSettings(settings),
  };
  await invoke("seed_db", { data });
}
