import { AppError } from "@koloda/app";
import type { CreateSpaceData, ImportMode, JoinedSpace, SyncStatus } from "@koloda/app";
import { langAtom } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
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
    acceptRestoreMutation: () => ({ mutationFn: vi.fn() }),
    nudge: vi.fn(async () => {}),
  };
}

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  // WHY: a fresh store per test keeps one test's join count out of the next; sizes format in the set language.
  const store = createStore();
  store.set(langAtom, "en");
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  }
  return { queryClient, Wrapper };
}

function renderSync(current: SyncStatus, sync: SyncQueries) {
  const { queryClient, Wrapper } = wrapper();
  return { queryClient, ...render(<SettingsSync status={current} sync={sync} />, { wrapper: Wrapper }) };
}

type PageProps = { sync: SyncQueries };

// WHY: the route renders the page from the status query, so a status the join leaves re-renders it as in the app.
function Page({ sync }: PageProps) {
  const { data } = useQuery(sync.getStatusQuery());
  return data ? <SettingsSync status={data} sync={sync} /> : null;
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

  it("has a device the server no longer knows leave its space first, since an attached device cannot join", () => {
    renderSync(status({ type: "stopped", stop: { reason: "unknownDevice" } }), syncQueries(vi.fn()));

    expect(screen.getByText("settings.sync.stop.unknown-device")).not.toBeNull();
    expect(screen.getByRole("button", { name: "settings.sync.leave" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "settings.sync.join" })).toBeNull();
    expect(screen.queryByRole("button", { name: "settings.sync.sync-now" })).toBeNull();
  });

  it("offers a device a restore left out of its space to join again", () => {
    renderSync(status({ type: "stopped", stop: { reason: "restored" } }), syncQueries(vi.fn()));

    expect(screen.getByText("settings.sync.stop.pair-again")).not.toBeNull();
    expect(screen.getByRole("button", { name: "settings.sync.join" })).not.toBeNull();
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

    expect(screen.getByText("settings.sync.stop.error no reply from the sync server")).not.toBeNull();
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

describe("SettingsSync add or replace", () => {
  it("asks a used database that joined to add or replace, recommending Replace for a likely copy", async () => {
    const pending = status({ type: "importPending" });
    const joined: JoinedSpace = { mode: "used", knownIds: 3, status: pending };
    const importData = vi.fn(async (_mode: ImportMode) => status({ type: "bootstrapping" }));
    const sync: SyncQueries = {
      ...syncQueries(vi.fn()),
      getStatusQuery: () => ({
        queryKey: ["sync", "status"],
        queryFn: async () => status({ type: "notEnrolled" }),
        staleTime: Infinity,
      }),
      previewMutation: () => ({ mutationFn: async () => ({ spaceName: "Study", counts: {}, bytes: 0 }) }),
      joinMutation: () => ({ mutationFn: async () => joined }),
      importMutation: () => ({ mutationFn: importData }),
    };
    const { Wrapper } = wrapper();
    render(<Page sync={sync} />, { wrapper: Wrapper });

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "settings.sync.join" }));
    });
    await screen.findByDisplayValue("laptop");
    fill("settings.sync.server-url.label", "https://sync.example.test");
    fill("settings.sync.invite.code", "ABCDE12345");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "settings.sync.join.continue" }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "settings.sync.join.submit" }));
    });

    expect(await screen.findByText("settings.sync.import.copy")).not.toBeNull();
    expect(screen.getByRole("button", { name: "settings.sync.import.replace.recommended" })).not.toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "settings.sync.import.add" }));
    });
    expect(importData).toHaveBeenCalledWith("add", expect.anything());
  });

  it("replaces this device's data only once confirmed, then refreshes every screen", async () => {
    const importData = vi.fn(async (_mode: ImportMode) => status({ type: "bootstrapping" }));
    const { queryClient } = renderSync(status({ type: "importPending" }), {
      ...syncQueries(vi.fn()),
      importMutation: () => ({ mutationFn: importData }),
    });
    queryClient.setQueryData(["decks"], []);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "settings.sync.import.replace" }));
    });
    expect(screen.getByText("settings.sync.import.replace.message")).not.toBeNull();
    expect(importData).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "settings.sync.import.replace.confirm" }));
    });
    expect(importData).toHaveBeenCalledWith("replace", expect.anything());
    expect(queryClient.getQueryState(["decks"])?.isInvalidated).toBe(true);
  });
});
