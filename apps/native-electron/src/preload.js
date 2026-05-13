const { contextBridge, ipcRenderer, webFrame } = require("electron");

const ZOOM_STEP = 0.5;
const MIN_ZOOM = -3;
const MAX_ZOOM = 3;

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (cmd, args) => ipcRenderer.invoke(cmd, args),
  on: (channel, callback) => {
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
