import { app, screen } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserWindow } from "electron";

const WINDOW_STATE_FILE = "window-state.json";

export type WindowState = {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
};

export function loadWindowState(): WindowState {
  const defaults: WindowState = { width: 1280, height: 720 };
  try {
    const raw = readFileSync(join(app.getPath("userData"), WINDOW_STATE_FILE), "utf-8");
    const state = JSON.parse(raw) as WindowState;
    if (state.width > 0 && state.height > 0 && isWithinDisplay(state)) {
      return state;
    }
  } catch {}
  return defaults;
}

export function saveWindowState(win: BrowserWindow) {
  const isMaximized = win.isMaximized();
  const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized,
  };
  try {
    writeFileSync(join(app.getPath("userData"), WINDOW_STATE_FILE), JSON.stringify(state));
  } catch {}
}

function isWithinDisplay(state: WindowState): boolean {
  if (state.x === undefined || state.y === undefined) return true;
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const { x, y, width, height } = display.bounds;
    return state.x! < x + width && state.x! + state.width > x && state.y! < y + height && state.y! + state.height > y;
  });
}
