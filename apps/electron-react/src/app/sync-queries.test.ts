import type { SyncStatus } from "@koloda/app";
import type { SyncStarter } from "@koloda/native-ipc";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncStart } from "./sync-queries";

type InvokeFn = (cmd: string, args?: unknown) => Promise<unknown>;

const invokeMock = vi.fn<InvokeFn>();

const starter = { algorithm: { title: "Default" }, template: { title: "Default" } } as unknown as SyncStarter;

const idle = { state: { type: "idle" } } as SyncStatus;

beforeEach(() => {
  invokeMock.mockReset();
  vi.stubGlobal("window", { electronAPI: { invoke: invokeMock } });
});

describe("createSyncStart", () => {
  it("starts the engine from the status once the app provides the starter, until a start succeeds", async () => {
    const start = createSyncStart();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const query = { queryKey: ["sync", "status"], queryFn: start.getStatus, staleTime: 0 };
    invokeMock.mockRejectedValueOnce(new Error("keyring")).mockResolvedValue(idle);

    // A status read before the database is known waits for the starter.
    const first = queryClient.fetchQuery(query).catch((error: unknown) => error);
    await Promise.resolve();
    expect(invokeMock).not.toHaveBeenCalled();

    start.provide(starter);
    expect(await first).toBeInstanceOf(Error);
    expect(queryClient.getQueryState(["sync", "status"])?.status).toBe("error");

    // Retrying the status retries the start; once started, the status only reads it.
    expect(await queryClient.fetchQuery(query)).toEqual(idle);
    expect(await queryClient.fetchQuery(query)).toEqual(idle);

    expect(invokeMock.mock.calls.map(([cmd]) => cmd)).toEqual(["cmd_sync_start", "cmd_sync_start", "cmd_sync_status"]);
    expect(invokeMock.mock.calls[0]?.[1]).toEqual({ starter });
  });
});
