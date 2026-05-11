import { app, BrowserWindow, ipcMain } from "electron";
import { createRequire } from "node:module";
import { join } from "node:path";

const isDev = !app.isPackaged;
const __dirname = import.meta.dirname!;

function configureUserData() {
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
  const addonPath = isDev
    ? join(__dirname, "..", "dist", "koloda_electron.node")
    : join(__dirname, "koloda_electron.node");
  return req(addonPath);
}

function createWindow() {
  const commonOptions = {
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  const win = process.platform === "darwin"
    ? new BrowserWindow({
        ...commonOptions,
        titleBarStyle: "hidden",
        trafficLightPosition: { x: 12, y: 16 },
      })
    : new BrowserWindow({
        ...commonOptions,
        titleBarStyle: "hidden",
        titleBarOverlay: { height: 32 },
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
}

function j<T = any>(raw: string | null | undefined): T | null {
  if (raw === null || raw === undefined || raw === "null") return null;
  return JSON.parse(raw) as T;
}

function registerDataIpc(db: any) {
  ipcMain.handle("get_db_status", async () => db.getDbStatus());

  ipcMain.handle("seed_db", async (_event, data: unknown) => {
    await db.seedDb(data);
    return true;
  });

  ipcMain.handle("cmd_get_cards", async (_event, { params }: any) => j(db.getCards(params.deck_id)));
  ipcMain.handle("cmd_get_card", async (_event, { id }: any) => j(db.getCard(id)));
  ipcMain.handle("cmd_add_card", async (_event, { data }: any) => j(db.addCard(data)));
  ipcMain.handle("cmd_add_cards", async (_event, { data }: any) => j(db.addCards(data)));
  ipcMain.handle("cmd_update_card", async (_event, { data }: any) => j(db.updateCard(data)));
  ipcMain.handle("cmd_delete_card", async (_event, { data }: any) => db.deleteCard(data));
  ipcMain.handle("cmd_delete_cards", async (_event, { data }: any) => db.deleteCards(data));
  ipcMain.handle("cmd_reset_card_progress", async (_event, { data }: any) => j(db.resetCardProgress(data)));

  ipcMain.handle("cmd_get_algorithms", async () => j(db.getAlgorithms()));
  ipcMain.handle("cmd_get_algorithm", async (_event, { id }: any) => j(db.getAlgorithm(id)));
  ipcMain.handle("cmd_add_algorithm", async (_event, { data }: any) => j(db.addAlgorithm(data)));
  ipcMain.handle("cmd_clone_algorithm", async (_event, { data }: any) => j(db.cloneAlgorithm(data)));
  ipcMain.handle("cmd_update_algorithm", async (_event, { data }: any) => j(db.updateAlgorithm(data)));
  ipcMain.handle("cmd_delete_algorithm", async (_event, { data }: any) => db.deleteAlgorithm(data));
  ipcMain.handle("cmd_get_algorithm_decks", async (_event, { id }: any) => j(db.getAlgorithmDecks(id)));

  ipcMain.handle("cmd_get_decks", async () => j(db.getDecks()));
  ipcMain.handle("cmd_get_deck", async (_event, { id }: any) => j(db.getDeck(id)));
  ipcMain.handle("cmd_add_deck", async (_event, { data }: any) => j(db.addDeck(data)));
  ipcMain.handle("cmd_update_deck", async (_event, { data }: any) => j(db.updateDeck(data)));
  ipcMain.handle("cmd_delete_deck", async (_event, { data }: any) => db.deleteDeck(data));

  ipcMain.handle("cmd_get_templates", async () => j(db.getTemplates()));
  ipcMain.handle("cmd_get_template", async (_event, { id }: any) => j(db.getTemplate(id)));
  ipcMain.handle("cmd_add_template", async (_event, { data }: any) => j(db.addTemplate(data)));
  ipcMain.handle("cmd_clone_template", async (_event, { data }: any) => j(db.cloneTemplate(data)));
  ipcMain.handle("cmd_update_template", async (_event, { data }: any) => j(db.updateTemplate(data)));
  ipcMain.handle("cmd_delete_template", async (_event, { data }: any) => db.deleteTemplate(data));
  ipcMain.handle("cmd_get_template_decks", async (_event, { id }: any) => j(db.getTemplateDecks(id)));

  ipcMain.handle("cmd_get_settings", async (_event, { name }: any) => j(db.getSettings(name)));
  ipcMain.handle("cmd_set_settings", async (_event, { name, content }: any) => db.setSettings(name, content));
  ipcMain.handle("cmd_patch_settings", async (_event, { name, patch }: any) => j(db.patchSettings(name, patch)));

  ipcMain.handle("cmd_get_lessons", async (_event, { params }: any) => j(db.getLessons(params.dueAt, params.filters ?? null)));
  ipcMain.handle("cmd_get_lesson_data", async (_event, { params }: any) => j(db.getLessonData(params)));
  ipcMain.handle("cmd_submit_lesson_result", async (_event, { data }: any) => db.submitLessonResult(data));

  ipcMain.handle("cmd_get_reviews", async (_event, { data }: any) => j(db.getReviews(data)));
  ipcMain.handle("cmd_get_review_totals", async (_event, params: any) => j(db.getReviewTotals(params.from, params.to)));
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
