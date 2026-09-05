import { app } from "electron";
import { createRequire } from "node:module";
import { join } from "node:path";
import { registerDataIpc } from "./data-ipc";
import { appDir, isDev } from "./env";
import { createWindow } from "./window";
import { registerWindowIpc } from "./window-ipc";

function configureUserData() {
  const override = process.env.KOLODA_USER_DATA;
  if (override) {
    app.setPath("userData", override);
    return;
  }

  if (process.platform === "darwin") {
    app.setPath("userData", join(app.getPath("home"), "Library", "Application Support", "koloda"));
  } else if (process.platform === "linux") {
    app.setPath("userData", join(app.getPath("home"), ".local", "share", "koloda"));
  } else {
    app.setPath("userData", join(app.getPath("appData"), "koloda"));
  }
}

function loadNativeAddon(): { KolodaDb: new (dbPath: string) => any } {
  const req = createRequire(import.meta.url);
  const addonPath = isDev ? join(appDir, "..", "dist", "koloda_electron.node") : join(appDir, "koloda_electron.node");
  return req(addonPath);
}

configureUserData();

app.whenReady().then(() => {
  const native = loadNativeAddon();
  const dbPath = join(app.getPath("userData"), "koloda.db");
  const db = new native.KolodaDb(dbPath);

  registerWindowIpc();
  registerDataIpc(db);
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
