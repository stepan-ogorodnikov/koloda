import type { SyncStatus, SyncStop } from "@koloda/app";
import { langAtom } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { SettingsSyncProblems } from "./settings-sync-problems";

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

function status(overrides: Partial<SyncStatus>): SyncStatus {
  return {
    state: { type: "idle" },
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

function renderProblems(current: SyncStatus, acceptRestore = vi.fn()) {
  const sync = { acceptRestoreMutation: () => ({ mutationFn: acceptRestore }) } as unknown as SyncQueries;
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const store = createStore();
  store.set(langAtom, "en");
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  }
  render(<SettingsSyncProblems status={current} sync={sync} />, { wrapper: Wrapper });
  return queryClient;
}

describe("SettingsSyncProblems", () => {
  it.each<[SyncStop, string]>([
    [{ reason: "clockSkew" }, "settings.sync.stop.clock-skew"],
    [{ reason: "unknownDevice" }, "settings.sync.stop.pair-again"],
    [{ reason: "restored" }, "settings.sync.stop.pair-again"],
    [{ reason: "authoritativeRestore" }, "settings.sync.stop.authoritative-restore"],
    [{ reason: "lowDisk", needed: 2_500_000_000, free: 300_000_000 }, "settings.sync.stop.low-disk 2.5 GB 300 MB"],
    [{ reason: "pushRefused", code: "stamp_ahead" }, "settings.sync.stop.push-refused stamp_ahead"],
    [{ reason: "error", message: "no reply" }, "settings.sync.stop.error no reply"],
  ])("says why sync stopped for %o", (stop, message) => {
    renderProblems(status({ state: { type: "stopped", stop }, skewMs: 7 * 60_000 }));

    expect(screen.getByText(message)).not.toBeNull();
  });

  it("offers to accept an authoritative restore only once confirmed, and keeps the status it returns", async () => {
    const after = status({ state: { type: "bootstrapping" } });
    const acceptRestore = vi.fn(async () => after);
    const queryClient = renderProblems(
      status({ state: { type: "stopped", stop: { reason: "authoritativeRestore" } } }),
      acceptRestore,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "settings.sync.restore.continue" }));
    });
    expect(screen.getByText("settings.sync.restore.message")).not.toBeNull();
    expect(acceptRestore).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "settings.sync.restore.confirm" }));
    });
    expect(acceptRestore).toHaveBeenCalled();
    expect(queryClient.getQueryData(["sync", "status"])).toBe(after);
  });

  it("asks for an app update on a change this version cannot read", () => {
    renderProblems(status({ hold: { lane: "hot", seq: 5, reason: "updateRequired" } }));

    expect(screen.getByText("settings.sync.hold.update-required")).not.toBeNull();
  });

  it("names a damaged change by lane and seq, with the operator's command to drop it", () => {
    renderProblems(status({ hold: { lane: "cold", seq: 17, reason: "corruptEnvelope" } }));

    expect(screen.getByText("settings.sync.hold.corrupt cold 17")).not.toBeNull();
    expect(screen.getByText(/drop-envelope --data-dir <data-dir> <space> cold 17$/)).not.toBeNull();
  });

  it("says when the space is full, and when uploads wait for the server's clock", () => {
    renderProblems(status({ isOverQuota: true, pushResumesAt: Date.UTC(2026, 9, 10, 12, 30) }));

    expect(screen.getByText("settings.sync.over-quota")).not.toBeNull();
    expect(screen.getByText(/^settings\.sync\.push-waits /)).not.toBeNull();
  });

  it("says nothing while sync runs without a problem", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsSyncProblems status={status({})} sync={{} as SyncQueries} />
      </QueryClientProvider>,
    );

    expect(container.textContent).toBe("");
  });
});
