import { SYNC_EVENT_CHANNEL } from "@koloda/native-ipc";
import type { SyncStarter } from "@koloda/native-ipc";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncEngineEvent } from "./koloda-db";
import { registerSyncIpc } from "./sync-ipc";

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args: unknown) => unknown>(),
  windows: [] as Array<{ webContents: { isDestroyed: () => boolean; send: ReturnType<typeof vi.fn> } }>,
}));

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => electron.windows },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, args: unknown) => unknown) =>
      electron.handlers.set(channel, handler),
  },
  powerMonitor: { on: vi.fn() },
}));

// WHY: the sender check reads the frame URL against the app's navigation target; it has its own tests.
vi.mock("./app-sender", () => ({ assertAppSender: vi.fn() }));

function window(isDestroyed = false) {
  return { webContents: { isDestroyed: () => isDestroyed, send: vi.fn() } };
}

async function startedSync() {
  let onEvent: (event: SyncEngineEvent) => void = () => {};
  registerSyncIpc({
    syncStart: vi.fn(async (_starter: SyncStarter, callback: (event: SyncEngineEvent) => void) => {
      onEvent = callback;
      return { state: { type: "notEnrolled" } } as never;
    }),
    syncStatus: vi.fn(),
    syncNudge: vi.fn(),
    syncCreateSpace: vi.fn(),
  });
  await electron.handlers.get("cmd_sync_start")?.({}, { starter: {} });
  return (event: SyncEngineEvent) => onEvent(event);
}

describe("sync events", () => {
  afterEach(() => {
    electron.handlers.clear();
    electron.windows.length = 0;
    vi.restoreAllMocks();
  });

  it("forwards every event but an error to every open window", async () => {
    const open = [window(), window()];
    electron.windows.push(...open, window(true));
    const emit = await startedSync();

    emit({ type: "changed", kinds: ["cards"] });

    for (const { webContents } of open) {
      expect(webContents.send).toHaveBeenCalledWith(SYNC_EVENT_CHANNEL, { type: "changed", kinds: ["cards"] });
    }
    expect(electron.windows[2]?.webContents.send).not.toHaveBeenCalled();
  });

  it("logs an error and sends it to no window", async () => {
    const open = window();
    electron.windows.push(open);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const emit = await startedSync();

    emit({ type: "error", message: "no reply from the sync server" });

    expect(log).toHaveBeenCalledWith(expect.stringContaining("no reply from the sync server"));
    expect(open.webContents.send).not.toHaveBeenCalled();
  });
});
