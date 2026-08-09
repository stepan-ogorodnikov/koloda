import { beforeEach, describe, expect, it, vi } from "vitest";

const shutdownAssistantGracefully = vi.fn(async () => {});

vi.mock("@koloda/srs-react", () => ({
  shutdownAssistantGracefully: (...args: unknown[]) => shutdownAssistantGracefully(...args),
}));

import { installElectronCloseCoordination } from "./electron-close-coordination";

type InvokeFn = (cmd: string, args?: unknown) => Promise<unknown>;

const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

function emit(channel: string) {
  for (const listener of listeners.get(channel) ?? []) listener();
}

const invokeMock = vi.fn<InvokeFn>();
const store = {} as Parameters<typeof installElectronCloseCoordination>[0];

beforeEach(() => {
  listeners.clear();
  invokeMock.mockReset();
  shutdownAssistantGracefully.mockClear();
  shutdownAssistantGracefully.mockResolvedValue(undefined);
  const electronAPI = {
    invoke: invokeMock as Window["electronAPI"]["invoke"],
    on: (channel: string, callback: (...args: unknown[]) => void) => {
      const set = listeners.get(channel) ?? new Set();
      set.add(callback);
      listeners.set(channel, set);
      return () => {
        set.delete(callback);
      };
    },
    getZoomFactor: () => 1,
    getZoomLevel: () => 0,
    onZoomFactorChanged: () => () => {},
    zoomIn: () => {},
    zoomOut: () => {},
    zoomReset: () => {},
    setZoomLevel: () => {},
  };
  vi.stubGlobal("window", { electronAPI });
});

describe("installElectronCloseCoordination", () => {
  it("is a no-op stub when electronAPI is missing", () => {
    vi.stubGlobal("window", {});
    const uninstall = installElectronCloseCoordination(store);
    uninstall();
    expect(shutdownAssistantGracefully).not.toHaveBeenCalled();
  });

  it("awaits graceful shutdown then acks main", async () => {
    let resolveShutdown!: () => void;
    shutdownAssistantGracefully.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveShutdown = resolve;
        }),
    );
    invokeMock.mockResolvedValue(undefined);

    const uninstall = installElectronCloseCoordination(store);
    emit("app:shutdown-request");

    expect(shutdownAssistantGracefully).toHaveBeenCalledTimes(1);
    expect(shutdownAssistantGracefully).toHaveBeenCalledWith(store);
    expect(invokeMock).not.toHaveBeenCalled();

    resolveShutdown();
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("app:shutdown-ack");
    });

    // Duplicate request while in flight / after start is ignored.
    emit("app:shutdown-request");
    expect(shutdownAssistantGracefully).toHaveBeenCalledTimes(1);

    uninstall();
  });

  it("acks even when graceful shutdown rejects", async () => {
    shutdownAssistantGracefully.mockRejectedValueOnce(new Error("flush failed"));
    invokeMock.mockResolvedValue(undefined);

    installElectronCloseCoordination(store);
    emit("app:shutdown-request");

    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("app:shutdown-ack");
    });
  });
});
