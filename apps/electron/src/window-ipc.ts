import { BrowserWindow, ipcMain } from "electron";
import { APP_SHUTDOWN_ACK_CHANNEL } from "@koloda/native-ipc";
import { saveUiPrefs } from "./ui-prefs";
import { TITLEBAR_HEIGHT, getWindowButtonPosition, getWindowOverlayWidth, windowCloseCoordinators } from "./window";

export function registerWindowIpc() {
  ipcMain.handle(APP_SHUTDOWN_ACK_CHANNEL, (event) => {
    windowCloseCoordinators.get(event.sender.id)?.onShutdownAck();
  });
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
      if (options.color) {
        saveUiPrefs({
          backgroundColor: options.color,
          overlayColor: options.color,
          ...(options.symbolColor !== undefined ? { overlaySymbolColor: options.symbolColor } : {}),
        });
      }
    },
  );
  ipcMain.handle("window:get-overlay-width", () => getWindowOverlayWidth());
  ipcMain.handle("window:set-window-button-position", (event, options: { titlebarHeight?: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || process.platform !== "darwin") return;
    win.setWindowButtonPosition(getWindowButtonPosition(options.titlebarHeight));
  });
}
