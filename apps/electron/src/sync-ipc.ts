import type { IpcArgs, SyncEvent } from "@koloda/native-ipc";
import { SYNC_EVENT_CHANNEL } from "@koloda/native-ipc";
import { BrowserWindow, ipcMain, powerMonitor } from "electron";
import { assertAppSender } from "./app-sender";
import type { KolodaDb, SyncEngineEvent } from "./koloda-db";

type SyncDb = Pick<KolodaDb, "syncStart" | "syncStatus" | "syncNudge">;

function broadcast(event: SyncEvent) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) window.webContents.send(SYNC_EVENT_CHANNEL, event);
  }
}

// WHY: the status a window shows already says why sync stopped; the raw error is for whoever reads main's log.
function onEngineEvent(event: SyncEngineEvent) {
  if (event.type === "error") {
    console.error(`[sync] ${event.message}`);
    return;
  }
  broadcast(event);
}

export function registerSyncIpc(db: SyncDb) {
  ipcMain.handle("cmd_sync_start", (event, { starter }: IpcArgs<"cmd_sync_start">) => {
    assertAppSender(event);
    return db.syncStart(starter, onEngineEvent);
  });
  ipcMain.handle("cmd_sync_status", (event) => {
    assertAppSender(event);
    return db.syncStatus();
  });
  ipcMain.handle("cmd_sync_nudge", (event) => {
    assertAppSender(event);
    return db.syncNudge();
  });

  powerMonitor.on("resume", () => {
    void db.syncNudge();
  });
}
