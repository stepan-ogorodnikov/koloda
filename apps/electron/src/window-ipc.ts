import { BrowserWindow, ipcMain } from "electron";
import {
  APP_SHUTDOWN_ACK_CHANNEL,
  WINDOW_CLOSE_CHANNEL,
  WINDOW_GET_OVERLAY_WIDTH_CHANNEL,
  WINDOW_IS_MAXIMIZED_CHANNEL,
  WINDOW_MAXIMIZE_CHANNEL,
  WINDOW_MINIMIZE_CHANNEL,
  WINDOW_SET_TITLE_BAR_OVERLAY_CHANNEL,
  WINDOW_SET_WINDOW_BUTTON_POSITION_CHANNEL,
} from "@koloda/native-ipc";
import { saveUiPrefs } from "./ui-prefs";
import { TITLEBAR_HEIGHT, getWindowButtonPosition, getWindowOverlayWidth, windowCloseCoordinators } from "./window";

export function registerWindowIpc() {
  ipcMain.handle(APP_SHUTDOWN_ACK_CHANNEL, (event) => {
    windowCloseCoordinators.get(event.sender.id)?.onShutdownAck();
  });
  ipcMain.handle(WINDOW_MINIMIZE_CHANNEL, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle(WINDOW_MAXIMIZE_CHANNEL, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });
  ipcMain.handle(WINDOW_CLOSE_CHANNEL, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle(WINDOW_IS_MAXIMIZED_CHANNEL, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });
  ipcMain.handle(
    WINDOW_SET_TITLE_BAR_OVERLAY_CHANNEL,
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
  ipcMain.handle(WINDOW_GET_OVERLAY_WIDTH_CHANNEL, () => getWindowOverlayWidth());
  ipcMain.handle(WINDOW_SET_WINDOW_BUTTON_POSITION_CHANNEL, (event, options: { titlebarHeight?: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || process.platform !== "darwin") return;
    win.setWindowButtonPosition(getWindowButtonPosition(options.titlebarHeight));
  });
}
