import { app, BrowserWindow, ipcMain, nativeTheme, screen } from "electron";
import { createRequire } from "node:module";
import os from "node:os";
import { join } from "node:path";

const isDev = !app.isPackaged;
const __dirname = import.meta.dirname!;
const TITLEBAR_HEIGHT = 40;
const WINDOW_BUTTON_X = 12;
const MACOS_WINDOW_BUTTON_HEIGHT = 12;

function configureUserData() {
  if (process.platform === "darwin") {
    app.setPath("userData", join(app.getPath("home"), "Library", "Application Support", "koloda"));
  } else if (process.platform === "linux") {
    app.setPath("userData", join(app.getPath("home"), ".local", "share", "koloda"));
  } else {
    app.setPath("userData", join(app.getPath("appData"), "koloda"));
  }
}

function loadNativeAddon(): { KolodaDb: new(dbPath: string) => any } {
  const req = createRequire(import.meta.url);
  const addonPath = isDev
    ? join(__dirname, "..", "dist", "koloda_electron.node")
    : join(__dirname, "koloda_electron.node");
  return req(addonPath);
}

function getInitialTitleBarOverlay(): { height: number; color: string; symbolColor: string } | undefined {
  if (process.platform === "darwin") return undefined;
  const isDark = nativeTheme.shouldUseDarkColors;
  return {
    height: TITLEBAR_HEIGHT,
    color: isDark ? "#151515" : "#f5f5f4",
    symbolColor: isDark ? "#e8e8e8" : "#171717",
  };
}

function getWindowButtonPosition(titlebarHeight = TITLEBAR_HEIGHT) {
  return {
    x: WINDOW_BUTTON_X,
    y: Math.max(0, Math.round((titlebarHeight - MACOS_WINDOW_BUTTON_HEIGHT) / 2)),
  };
}

function createWindow() {
  const commonOptions = {
    width: 1280,
    height: 720,
    minWidth: 320,
    minHeight: 320,
    resizable: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, isDev ? "../dist/preload.js" : "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  const win = process.platform === "darwin"
    ? new BrowserWindow({
      ...commonOptions,
      titleBarStyle: "hidden",
      trafficLightPosition: getWindowButtonPosition(),
    })
    : new BrowserWindow({
      ...commonOptions,
      titleBarStyle: "hidden",
      titleBarOverlay: getInitialTitleBarOverlay(),
    });

  win.on("maximize", () => win.webContents.send("window:maximize-changed", true));
  win.on("unmaximize", () => win.webContents.send("window:maximize-changed", false));

  win.once("ready-to-show", () => {
    win.show();
    if (isDev) win.webContents.openDevTools();
  });

  if (isDev) {
    win.loadURL("http://localhost:3000");
  } else {
    win.loadFile(join(__dirname, "../native-electron-react/index.html"));
  }

  return win;
}

function getWindowOverlayWidth(): number {
  if (process.platform === "darwin") return 64;
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
  if (process.platform === "linux") return Math.round(100 * scaleFactor);
  const winBuild = parseInt(os.release().split(".").pop() || "0");
  const base = winBuild >= 22000 ? 140 : 110;
  return Math.round(base * scaleFactor);
}

function registerWindowIpc() {
  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle("window:maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });
  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle("window:isMaximized", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });
  ipcMain.handle(
    "window:set-title-bar-overlay",
    (event, options: { color?: string; symbolColor?: string; height?: number }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || process.platform === "darwin") return;
      win.setTitleBarOverlay({
        height: options.height ?? TITLEBAR_HEIGHT,
        color: options.color,
        symbolColor: options.symbolColor,
      });
    },
  );
  ipcMain.handle("window:get-overlay-width", () => getWindowOverlayWidth());
  ipcMain.handle("window:set-window-button-position", (event, options: { titlebarHeight?: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || process.platform !== "darwin") return;
    win.setWindowButtonPosition(getWindowButtonPosition(options.titlebarHeight));
  });
}

function j<T = any>(raw: string | null | undefined): T | null {
  if (raw === null || raw === undefined || raw === "null") return null;
  return JSON.parse(raw) as T;
}

function registerDataIpc(db: any) {
  ipcMain.handle("get_db_status", async () => db.getDbStatus());

  ipcMain.handle("seed_db", async (_event, { data }: any) => {
    await db.seedDb(data);
    return true;
  });

  ipcMain.handle("cmd_get_cards", async (_event, { params }: any) => j(db.getCards(params)));
  ipcMain.handle("cmd_get_card", async (_event, args: any) => j(db.getCard(args)));
  ipcMain.handle("cmd_add_card", async (_event, { data }: any) => j(db.addCard(data)));
  ipcMain.handle("cmd_add_cards", async (_event, { data }: any) => j(db.addCards(data)));
  ipcMain.handle("cmd_update_card", async (_event, { data }: any) => j(db.updateCard(data)));
  ipcMain.handle("cmd_delete_card", async (_event, { data }: any) => db.deleteCard(data));
  ipcMain.handle("cmd_delete_cards", async (_event, { data }: any) => db.deleteCards(data));
  ipcMain.handle("cmd_reset_card_progress", async (_event, { data }: any) => j(db.resetCardProgress(data)));

  ipcMain.handle("cmd_get_algorithms", async () => j(db.getAlgorithms()));
  ipcMain.handle("cmd_get_algorithm", async (_event, args: any) => j(db.getAlgorithm(args)));
  ipcMain.handle("cmd_add_algorithm", async (_event, { data }: any) => j(db.addAlgorithm(data)));
  ipcMain.handle("cmd_clone_algorithm", async (_event, { data }: any) => j(db.cloneAlgorithm(data)));
  ipcMain.handle("cmd_update_algorithm", async (_event, { data }: any) => j(db.updateAlgorithm(data)));
  ipcMain.handle("cmd_delete_algorithm", async (_event, { data }: any) => db.deleteAlgorithm(data));
  ipcMain.handle("cmd_get_algorithm_decks", async (_event, args: any) => j(db.getAlgorithmDecks(args)));

  ipcMain.handle("cmd_get_decks", async () => j(db.getDecks()));
  ipcMain.handle("cmd_get_deck", async (_event, args: any) => j(db.getDeck(args)));
  ipcMain.handle("cmd_add_deck", async (_event, { data }: any) => j(db.addDeck(data)));
  ipcMain.handle("cmd_update_deck", async (_event, { data }: any) => j(db.updateDeck(data)));
  ipcMain.handle("cmd_delete_deck", async (_event, { data }: any) => db.deleteDeck(data));

  ipcMain.handle("cmd_get_templates", async () => j(db.getTemplates()));
  ipcMain.handle("cmd_get_template", async (_event, args: any) => j(db.getTemplate(args)));
  ipcMain.handle("cmd_add_template", async (_event, { data }: any) => j(db.addTemplate(data)));
  ipcMain.handle("cmd_clone_template", async (_event, { data }: any) => j(db.cloneTemplate(data)));
  ipcMain.handle("cmd_update_template", async (_event, { data }: any) => j(db.updateTemplate(data)));
  ipcMain.handle("cmd_delete_template", async (_event, { data }: any) => db.deleteTemplate(data));
  ipcMain.handle("cmd_get_template_decks", async (_event, args: any) => j(db.getTemplateDecks(args)));

  ipcMain.handle("cmd_get_settings", async (_event, args: any) => j(db.getSettings(args)));
  ipcMain.handle("cmd_set_settings", async (_event, args: any) => j(db.setSettings(args)));
  ipcMain.handle("cmd_patch_settings", async (_event, args: any) => j(db.patchSettings(args)));

  ipcMain.handle("cmd_get_lessons", async (_event, { params }: any) => j(db.getLessons(params)));
  ipcMain.handle("cmd_get_lesson_data", async (_event, { params }: any) => j(db.getLessonData(params)));
  ipcMain.handle("cmd_submit_lesson_result", async (_event, { data }: any) => db.submitLessonResult(data));

  ipcMain.handle("cmd_get_reviews", async (_event, { data }: any) => j(db.getReviews(data)));
  ipcMain.handle("cmd_get_review_totals", async (_event, { data }: any) => j(db.getReviewTotals(data)));
  ipcMain.handle("cmd_get_todays_review_totals", async () => j(db.getTodaysReviewTotals()));

  ipcMain.handle("cmd_get_ai_profiles", async () => j(db.getAiProfiles()));
  ipcMain.handle("cmd_add_ai_profile", async (_event, { data }: any) => j(db.addAiProfile(data)));
  ipcMain.handle("cmd_update_ai_profile", async (_event, { data }: any) => j(db.updateAiProfile(data)));
  ipcMain.handle("cmd_remove_ai_profile", async (_event, { data }: any) => db.removeAiProfile(data));
  ipcMain.handle("cmd_touch_ai_profile", async (_event, { data }: any) => db.touchAiProfile(data));
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
