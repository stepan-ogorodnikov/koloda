import { contextBridge, ipcRenderer, webFrame } from "electron";

const ZOOM_STEP = 0.5;
const MIN_ZOOM = -3;
const MAX_ZOOM = 3;

type ZoomFactorChangedCallback = (zoomFactor: number) => void;

const zoomFactorChangedCallbacks = new Set<ZoomFactorChangedCallback>();

function notifyZoomFactorChanged() {
  const zoomFactor = webFrame.getZoomFactor();
  for (const callback of zoomFactorChangedCallbacks) callback(zoomFactor);
}

function setZoomLevel(level: number) {
  const next = Math.min(Math.max(level, MIN_ZOOM), MAX_ZOOM);
  if (next === webFrame.getZoomLevel()) return;

  webFrame.setZoomLevel(next);
  notifyZoomFactorChanged();
}

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: <T>(cmd: string, args?: unknown): Promise<T> => ipcRenderer.invoke(cmd, args),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  getZoomFactor: () => webFrame.getZoomFactor(),
  getZoomLevel: () => webFrame.getZoomLevel(),
  onZoomFactorChanged: (callback: ZoomFactorChangedCallback) => {
    zoomFactorChangedCallbacks.add(callback);
    return () => {
      zoomFactorChangedCallbacks.delete(callback);
    };
  },
  zoomIn: () => setZoomLevel(webFrame.getZoomLevel() + ZOOM_STEP),
  zoomOut: () => setZoomLevel(webFrame.getZoomLevel() - ZOOM_STEP),
  zoomReset: () => setZoomLevel(0),
  setZoomLevel: (level: number) => setZoomLevel(level),
});
