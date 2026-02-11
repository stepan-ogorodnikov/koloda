import type {
  HotkeysSettings,
  InsertAlgorithmData,
  InsertTemplateData,
  InterfaceSettings,
  LearningSettings,
} from "@koloda/srs";
import {
  DEFAULT_FSRS_ALGORITHM,
  DEFAULT_HOTKEYS_SETTINGS,
  DEFAULT_INTERFACE_SETTINGS,
  DEFAULT_LEARNING_SETTINGS,
  DEFAULT_TEMPLATE,
} from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import type { I18nContext } from "@lingui/react";
import { invoke } from "@tauri-apps/api/core";

type DbStatus = "blank" | "ok";

/**
 * Gets the current status of the database from the Tauri backend
 * @returns "blank" if database has no content, "ok" otherwise
 */
export async function getStatus() {
  try {
    const status = await invoke<DbStatus>("get_db_status");
    return status;
  } catch (error) {
    console.error("Failed to get database status:", error);
    return "blank";
  }
}

type seedParams = Partial<InterfaceSettings> & { t: I18nContext["_"] };

type SeedData = {
  algorithm: InsertAlgorithmData;
  template: InsertTemplateData;
  settings: {
    interface: InterfaceSettings;
    learning: LearningSettings;
    hotkeys: HotkeysSettings;
  };
};

/**
 * Prepares seed data and invokes tauri callback
 * @param data - Configuration data including interface settings and translation function
 * @returns true if success, false if error
 */
export async function seedDB({ t, ...settings }: seedParams): Promise<boolean> {
  try {
    const status = await getStatus();
    if (status === "ok") return true;

    const title = t(msg`app.setup.default-title`);
    const data: SeedData = {
      algorithm: { title, content: DEFAULT_FSRS_ALGORITHM },
      template: { ...DEFAULT_TEMPLATE, title },
      settings: {
        interface: { ...DEFAULT_INTERFACE_SETTINGS, ...settings },
        learning: DEFAULT_LEARNING_SETTINGS,
        hotkeys: DEFAULT_HOTKEYS_SETTINGS,
      },
    };
    await invoke("seed_db", { data });

    return true;
  } catch (error) {
    console.error("Failed to setup from scratch:", error);
    return false;
  }
}
