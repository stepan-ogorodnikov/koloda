import { AppError } from "@koloda/app";
import type { CreateSpaceData, SyncStatus } from "@koloda/app";
import type { SyncQueries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { SettingsSync } from "./settings-sync";

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

function status(state: SyncStatus["state"], overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    state,
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
    ...overrides,
  };
}

function syncQueries(createSpace: (data: CreateSpaceData) => Promise<SyncStatus>): SyncQueries {
  return {
    getStatusQuery: () => ({ queryKey: ["sync", "status"], queryFn: async () => status({ type: "idle" }) }),
    getDeviceNameQuery: () => ({ queryKey: ["sync", "device_name"], queryFn: async () => "laptop" }),
    createSpaceMutation: () => ({ mutationFn: createSpace }),
    issuePairingMutation: () => ({ mutationFn: vi.fn() }),
    getDevicesQuery: () => ({ queryKey: ["sync", "devices"], queryFn: async () => [] }),
    revokeDeviceMutation: () => ({ mutationFn: vi.fn() }),
    detachMutation: () => ({ mutationFn: vi.fn() }),
    previewMutation: () => ({ mutationFn: vi.fn() }),
    joinMutation: () => ({ mutationFn: vi.fn() }),
    importMutation: () => ({ mutationFn: vi.fn() }),
    nudge: vi.fn(async () => {}),
  };
}

function renderSync(current: SyncStatus, sync: SyncQueries) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, ...render(<SettingsSync status={current} sync={sync} />, { wrapper: Wrapper }) };
}

async function openCreateDialog() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "settings.sync.create" }));
  });
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "settings.sync.create.submit" }));
  });
}

describe("SettingsSync", () => {
  it("offers to create a space only to a file in no space", () => {
    const sync = syncQueries(vi.fn());
    const { unmount } = renderSync(status({ type: "notEnrolled" }), sync);
    expect(screen.queryByRole("button", { name: "settings.sync.create" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "settings.sync.sync-now" })).toBeNull();
    unmount();

    renderSync(status({ type: "idle" }), sync);
    expect(screen.queryByRole("button", { name: "settings.sync.create" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "settings.sync.sync-now" }));
    expect(sync.nudge).toHaveBeenCalled();
  });

  it("tells a device that left its space, instead of showing its status", () => {
    renderSync(status({ type: "stopped", stop: { reason: "revoked" } }), syncQueries(vi.fn()));

    expect(screen.getByText("settings.sync.left")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "settings.sync.sync-now" })).toBeNull();
    expect(screen.queryByRole("button", { name: "settings.sync.create" })).toBeNull();
  });

  it("asks a database that joined with its own data to add or replace it, also after a restart", () => {
    renderSync(status({ type: "importPending" }), syncQueries(vi.fn()));

    expect(screen.getByText("settings.sync.import.message")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "settings.sync.sync-now" })).toBeNull();
  });

  it("shows what is left to download across both lanes while downloading", () => {
    renderSync(status({ type: "bootstrapping" }, { lagHot: 40, lagCold: 2 }), syncQueries(vi.fn()));

    expect(screen.getByText("settings.sync.download-left")).not.toBeNull();
  });

  it("shows why a stopped sync failed", () => {
    renderSync(
      status({ type: "stopped", stop: { reason: "error", message: "no reply from the sync server" } }),
      syncQueries(vi.fn()),
    );

    expect(screen.getByText("no reply from the sync server")).not.toBeNull();
  });
});

describe("SettingsSync create a space", () => {
  it("refuses empty fields without calling the server", async () => {
    const createSpace = vi.fn();
    renderSync(status({ type: "notEnrolled" }), syncQueries(createSpace));
    await openCreateDialog();

    await submit();

    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual(
      expect.arrayContaining([
        "validation.sync.server-url",
        "validation.sync.setup-token",
        "validation.sync.name.too-short",
      ]),
    );
    expect(createSpace).not.toHaveBeenCalled();
  });

  it("sends trimmed values with this device's host name, and keeps the space's status", async () => {
    const created = status({ type: "idle" });
    const createSpace = vi.fn(async () => created);
    const { queryClient } = renderSync(status({ type: "notEnrolled" }), syncQueries(createSpace));
    await openCreateDialog();
    await screen.findByDisplayValue("laptop");

    fill("settings.sync.server-url.label", " https://sync.example.test ");
    fill("settings.sync.setup-token.label", "token ");
    fill("settings.sync.space-name.label", " Study ");
    await submit();

    expect(createSpace).toHaveBeenCalledWith(
      {
        serverUrl: "https://sync.example.test",
        setupToken: "token",
        spaceName: "Study",
        deviceName: "laptop",
      },
      expect.anything(),
    );
    expect(queryClient.getQueryData(["sync", "status"])).toBe(created);
    expect(screen.queryByRole("button", { name: "settings.sync.create.submit" })).toBeNull();
  });

  it("shows the server's refusal and keeps the dialog open", async () => {
    const createSpace = vi.fn(async () => {
      throw new AppError("sync.insecure-server-url", "http://sync.example.test is not an https URL");
    });
    renderSync(status({ type: "notEnrolled" }), syncQueries(createSpace));
    await openCreateDialog();
    await screen.findByDisplayValue("laptop");

    fill("settings.sync.server-url.label", "http://sync.example.test");
    fill("settings.sync.setup-token.label", "token");
    fill("settings.sync.space-name.label", "Study");
    await submit();

    expect(await screen.findByText("sync.insecure-server-url")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "settings.sync.create.submit" })).not.toBeNull();
  });
});
