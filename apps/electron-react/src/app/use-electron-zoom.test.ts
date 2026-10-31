// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useElectronZoom } from "./use-electron-zoom";

function stubZoomApi() {
  const api = {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomReset: vi.fn(),
    getZoomLevel: vi.fn(() => 0),
    setZoomLevel: vi.fn(),
    onZoomFactorChanged: vi.fn(() => () => {}),
  };
  (window as unknown as { electronAPI: typeof api }).electronAPI = api;
  return api;
}

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe("useElectronZoom", () => {
  it.each([
    ["scrolling up zooms in", { deltaY: -1 }, "in"],
    ["scrolling down zooms out", { deltaY: 1 }, "out"],
    ["a sideways scroll keeps the zoom", { deltaX: 1 }, "none"],
  ] as const)("with Ctrl, %s", (_name, delta, expected) => {
    const api = stubZoomApi();
    const { unmount } = renderHook(() => useElectronZoom());

    window.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, cancelable: true, ...delta }));

    expect({ in: api.zoomIn.mock.calls.length, out: api.zoomOut.mock.calls.length }).toEqual({
      in: expected === "in" ? 1 : 0,
      out: expected === "out" ? 1 : 0,
    });
    unmount();
  });
});
