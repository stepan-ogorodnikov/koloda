import type { SyncStatus } from "@koloda/app";
import { langAtom } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { SyncIndicator } from "./sync-indicator";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

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

async function renderIndicator(current: SyncStatus, onOpen = vi.fn()) {
  const sync = {
    getStatusQuery: () => ({ queryKey: ["sync", "status"], queryFn: async () => current }),
  } as unknown as SyncQueries;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = createStore();
  store.set(langAtom, "en");
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  }
  const view = render(<SyncIndicator sync={sync} onOpen={onOpen} />, { wrapper: Wrapper });
  await act(async () => {
    await queryClient.refetchQueries();
  });
  return view;
}

describe("SyncIndicator", () => {
  it.each<[SyncStatus, string]>([
    [status({ type: "idle" }), "settings.sync.state.idle"],
    [status({ type: "syncing" }), "settings.sync.state.syncing"],
    [status({ type: "bootstrapping" }), "settings.sync.state.bootstrapping"],
    [status({ type: "stopped", stop: { reason: "error", message: "no reply" } }), "settings.sync.stop.error no reply"],
    [status({ type: "stopped", stop: { reason: "restored" } }), "settings.sync.stop.pair-again"],
    [status({ type: "importPending" }), "settings.sync.indicator.attention"],
    [status({ type: "idle" }, { isOverQuota: true }), "settings.sync.indicator.attention"],
    [
      status({ type: "idle" }, { hold: { lane: "hot", seq: 3, reason: "updateRequired" } }),
      "settings.sync.indicator.attention",
    ],
  ])("names the state of %o", async (current, label) => {
    await renderIndicator(current);

    expect(await screen.findByRole("button", { name: label })).not.toBeNull();
  });

  it.each([status({ type: "notEnrolled" }), status({ type: "stopped", stop: { reason: "revoked" } })])(
    "shows nothing on a device in no space by its own or another device's choice: %o",
    async (current) => {
      const { container } = await renderIndicator(current);

      expect(container.textContent).toBe("");
      expect(screen.queryByRole("button")).toBeNull();
    },
  );

  it("opens Sync settings", async () => {
    const onOpen = vi.fn();
    await renderIndicator(status({ type: "idle" }), onOpen);

    fireEvent.click(await screen.findByRole("button", { name: "settings.sync.state.idle" }));

    expect(onOpen).toHaveBeenCalled();
  });
});
