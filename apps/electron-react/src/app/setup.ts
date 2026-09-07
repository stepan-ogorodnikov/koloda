import type { InterfaceSettings } from "@koloda/app";
import { DEFAULT_INTERFACE_SETTINGS } from "@koloda/app";
import { DEFAULT_HOTKEYS_SETTINGS } from "@koloda/app";
import { DEFAULT_LEARNING_SETTINGS } from "@koloda/app";
import type { DbStatus, SeedDbData } from "@koloda/native-ipc";
import { DEFAULT_FSRS_ALGORITHM, DEFAULT_TEMPLATE } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import type { I18nContext } from "@lingui/react";
import { invoke } from "./electron";

export async function getStatus(): Promise<DbStatus> {
  return invoke("get_db_status", undefined);
}

type seedParams = Partial<InterfaceSettings> & { t: I18nContext["_"] };

export async function seedDB({ t, ...settings }: seedParams): Promise<void> {
  const status = await getStatus();
  if (status === "ok") return;

  const title = t(msg`app.setup.default-title`);
  const data: SeedDbData = {
    algorithm: { title, content: DEFAULT_FSRS_ALGORITHM },
    template: { ...DEFAULT_TEMPLATE, title },
    settings: {
      interface: { ...DEFAULT_INTERFACE_SETTINGS, ...settings },
      learning: DEFAULT_LEARNING_SETTINGS,
      hotkeys: DEFAULT_HOTKEYS_SETTINGS,
    },
  };
  await invoke("seed_db", { data });
}
