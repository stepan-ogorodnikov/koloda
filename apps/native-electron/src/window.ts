import { BrowserWindow, nativeTheme, screen } from "electron";
import os from "node:os";
import { join } from "node:path";
import { appDir, isDev } from "./env";
import { getDefaultSurfaceColor, loadUiPrefs } from "./ui-prefs";
import { loadWindowState, saveWindowState } from "./window-state";
import { APP_SHUTDOWN_REQUEST_CHANNEL, createWindowCloseCoordinator } from "./window-close-coordinator";
import type { WindowCloseCoordinator } from "./window-close-coordinator";

export const TITLEBAR_HEIGHT = 40;
const WINDOW_BUTTON_X = 12;
const MACOS_WINDOW_BUTTON_HEIGHT = 12;

// WHY: Ack IPC is process-global; map webContents → coordinator per window.
export const windowCloseCoordinators = new Map<number, WindowCloseCoordinator>();

function getInitialBackgroundColor() {
  return loadUiPrefs().backgroundColor ?? getDefaultSurfaceColor();
}

function getInitialTitleBarOverlay(): { height: number; color: string; symbolColor: string } | undefined {
  if (process.platform === "darwin") return undefined;
  const prefs = loadUiPrefs();
  const isDark = nativeTheme.shouldUseDarkColors;
  return {
    height: TITLEBAR_HEIGHT,
    color: prefs.overlayColor ?? getDefaultSurfaceColor(),
    symbolColor: prefs.overlaySymbolColor ?? (isDark ? "#abb2bf" : "#383a42"),
  };
}

export function getWindowButtonPosition(titlebarHeight = TITLEBAR_HEIGHT) {
  return {
    x: WINDOW_BUTTON_X,
    y: Math.max(0, Math.round((titlebarHeight - MACOS_WINDOW_BUTTON_HEIGHT) / 2)),
  };
}

export function getWindowOverlayWidth(): number {
  if (process.platform === "darwin") return 64;
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
  if (process.platform === "linux") return Math.round(100 * scaleFactor);
  const winBuild = parseInt(os.release().split(".").pop() || "0");
  const base = winBuild >= 22000 ? 140 : 110;
  return Math.round(base * scaleFactor);
}

export function createWindow() {
  const windowState = loadWindowState();

  const commonOptions = {
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 320,
    minHeight: 320,
    resizable: true,
    show: false,
    backgroundColor: getInitialBackgroundColor(),
    webPreferences: {
      // WHY: Packaged main.cjs + preload.js sit at asar root (electron-builder flattens dist/).
      preload: join(appDir, isDev ? "../dist/preload.js" : "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  const win =
    process.platform === "darwin"
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

  if (windowState.isMaximized) win.maximize();

  win.on("maximize", () => win.webContents.send("window:maximize-changed", true));
  win.on("unmaximize", () => win.webContents.send("window:maximize-changed", false));
  win.on("close", () => saveWindowState(win));
  attachWindowCloseCoordination(win);

  win.once("ready-to-show", () => {
    win.show();
    if (isDev && !process.env.KOLODA_E2E) win.webContents.openDevTools();
  });

  if (!isDev) {
    win.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      const mod = input.control || input.meta;
      const isReload =
        input.code === "F5" ||
        (input.code === "F5" && input.control) ||
        (input.code === "KeyR" && mod && input.shift) ||
        (input.code === "KeyR" && mod && !input.shift && !input.alt);
      if (isReload) event.preventDefault();
    });
  }

  if (isDev) {
    win.loadURL("http://localhost:3000");
  } else {
    // WHY: Hash `/` so TanStack starts on the index route under file:// (see native-electron-react main.tsx).
    win.loadFile(join(appDir, "../native-electron-react/index.html"), { hash: "/" });
  }

  return win;
}

function attachWindowCloseCoordination(win: BrowserWindow) {
  const contentsId = win.webContents.id;
  const coordinator = createWindowCloseCoordinator({
    requestRendererShutdown: () => {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(APP_SHUTDOWN_REQUEST_CHANNEL);
      }
    },
    closeWindow: () => {
      if (!win.isDestroyed()) win.close();
    },
    forceCloseWindow: () => {
      if (win.isDestroyed()) return;
      // WHY: destroy() may skip another `close` pass; persist bounds before teardown.
      saveWindowState(win);
      win.destroy();
    },
  });
  windowCloseCoordinators.set(contentsId, coordinator);

  win.on("close", (event) => {
    // INVARIANT: `defer` means the handshake is in flight — must preventDefault.
    if (coordinator.onCloseAttempt() === "defer") {
      event.preventDefault();
    }
  });

  win.on("closed", () => {
    coordinator.dispose();
    windowCloseCoordinators.delete(contentsId);
  });
}
