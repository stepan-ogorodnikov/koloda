import { contextBridge, ipcRenderer, webFrame } from "electron";

const ZOOM_STEP = 0.5;
const MIN_ZOOM = -3;
const MAX_ZOOM = 3;

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: <T>(cmd: string, args?: unknown): Promise<T> => ipcRenderer.invoke(cmd, args),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  zoomIn: () => {
    const current = webFrame.getZoomLevel();
    webFrame.setZoomLevel(Math.min(current + ZOOM_STEP, MAX_ZOOM));
  },
  zoomOut: () => {
    const current = webFrame.getZoomLevel();
    webFrame.setZoomLevel(Math.max(current - ZOOM_STEP, MIN_ZOOM));
  },
  zoomReset: () => webFrame.setZoomLevel(0),
});
