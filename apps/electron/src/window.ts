import { BrowserWindow, nativeTheme, shell } from "electron";
import type { WebContents } from "electron";
import { join } from "node:path";
import { appDir, isDev } from "./env";
import { appNavigationTarget, decideNavigation } from "./navigation-policy";
import type { AppNavigationTarget } from "./navigation-policy";
import { getDefaultSurfaceColor, loadUiPrefs } from "./ui-prefs";
import { loadWindowState, saveWindowState } from "./window-state";
import { APP_SHUTDOWN_REQUEST_CHANNEL } from "@koloda/native-ipc";
import { createWindowCloseCoordinator } from "./window-close-coordinator";
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

  const target = appNavigationTarget({ isDev, appDir });
  attachNavigationGuard(win.webContents, target);

  if (windowState.isMaximized) win.maximize();

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

  if (target.kind === "dev") {
    win.loadURL(target.origin);
  } else {
    // WHY: Hash `/` so TanStack starts on the index route under file:// (see electron-react main.tsx).
    win.loadFile(target.indexPath, { hash: "/" });
  }

  return win;
}

// WHY: A link in rendered markdown can navigate this window or open another one.
// Either page would re-run the preload and inherit every IPC channel.
function attachNavigationGuard(contents: WebContents, target: AppNavigationTarget) {
  const stop = (url: string, preventDefault: () => void, openHttp: boolean) => {
    const decision = decideNavigation(url, target);
    if (decision.action === "allow") return;
    preventDefault();
    if (openHttp && decision.action === "open-external") openInBrowser(decision.url);
  };

  // WHY: will-frame-navigate covers the main frame too, so will-navigate is not
  // also handled: both fire for one main-frame click and the link would open twice.
  contents.on("will-frame-navigate", (event) => {
    stop(event.url, () => event.preventDefault(), event.isMainFrame);
  });
  contents.on("will-redirect", (event) => {
    stop(event.url, () => event.preventDefault(), false);
  });
  contents.setWindowOpenHandler(({ url }) => {
    const decision = decideNavigation(url, target);
    if (decision.action === "open-external") openInBrowser(decision.url);
    return { action: "deny" };
  });
}

function openInBrowser(url: string) {
  void shell.openExternal(url).catch(() => {
    // WHY: a missing browser or a rejected launch must not take down the main process.
  });
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
