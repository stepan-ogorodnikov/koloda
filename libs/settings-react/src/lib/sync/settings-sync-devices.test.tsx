import type { SyncDevice, SyncStatus } from "@koloda/app";
import { langAtom } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { SettingsSyncDevices } from "./settings-sync-devices";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

vi.mock("@koloda/core-react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAppHotkey: () => {},
    useHotkeysSettings: () => ({
      ui: { close: ["Escape"] },
      form: { submit: ["Control+Enter"], reset: ["Escape"] },
    }),
  };
});

function device(overrides: Partial<SyncDevice>): SyncDevice {
  return {
    id: "d0",
    name: "device",
    platform: "desktop-linux",
    lastSeenAt: 1_760_000_000_000,
    isRevoked: false,
    isSelf: false,
    ...overrides,
  };
}

const DEVICES = [
  device({ id: "d1", name: "laptop", isSelf: true }),
  device({ id: "d2", name: "desktop", platform: "desktop-win" }),
  device({ id: "d3", name: "old phone", platform: "android", isRevoked: true }),
];

function renderDevices(overrides: Partial<SyncQueries> = {}) {
  const getDevices = vi.fn(async () => DEVICES);
  const sync = {
    getDevicesQuery: () => ({ queryKey: ["sync", "devices"], queryFn: getDevices }),
    revokeDeviceMutation: () => ({ mutationFn: vi.fn(async () => {}) }),
    detachMutation: () => ({ mutationFn: vi.fn() }),
    ...overrides,
  } as unknown as SyncQueries;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  // WHY: last-seen times format in the interface language, which the app sets before any screen renders.
  const store = createStore();
  store.set(langAtom, "en");
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  }
  render(<SettingsSyncDevices sync={sync} />, { wrapper: Wrapper });
  return { queryClient, getDevices };
}

async function press(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("SettingsSyncDevices", () => {
  it("lists the space's devices but revoked ones, and offers to remove only the others", async () => {
    renderDevices();

    expect(await screen.findByText("laptop")).not.toBeNull();
    expect(screen.getByText("desktop")).not.toBeNull();
    expect(screen.queryByText("old phone")).toBeNull();
    expect(screen.getByText("settings.sync.devices.this-device")).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "settings.sync.devices.remove" })).toHaveLength(1);
  });

  it("removes a device only once confirmed, then reloads the list", async () => {
    const revoke = vi.fn(async (_data: { id: string }) => {});
    const { getDevices } = renderDevices({ revokeDeviceMutation: () => ({ mutationFn: revoke }) });
    await screen.findByText("desktop");

    await press("settings.sync.devices.remove");
    expect(screen.getByText("settings.sync.devices.remove.message desktop")).not.toBeNull();
    expect(revoke).not.toHaveBeenCalled();

    await press("settings.sync.devices.remove.confirm");
    expect(revoke).toHaveBeenCalledWith({ id: "d2" }, expect.anything());
    expect(getDevices).toHaveBeenCalledTimes(2);
  });

  it("leaves the space only once confirmed, and keeps the status it returns", async () => {
    const left: SyncStatus = {
      state: { type: "stopped", stop: { reason: "revoked" } },
      lastSuccessAt: null,
      pending: 0,
      held: 0,
      uploads: 0,
      fetches: 0,
      lagHot: null,
      lagCold: null,
      skewMs: 0,
      hold: null,
      isOverQuota: false,
      pushResumesAt: null,
    };
    const detach = vi.fn(async () => left);
    const { queryClient } = renderDevices({ detachMutation: () => ({ mutationFn: detach }) });

    await press("settings.sync.leave");
    expect(detach).not.toHaveBeenCalled();
    await press("settings.sync.leave.confirm");

    expect(detach).toHaveBeenCalled();
    expect(queryClient.getQueryData(["sync", "status"])).toBe(left);
  });
});
