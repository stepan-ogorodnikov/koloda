import type { JoinedSpace, SpacePreview, SyncStatus } from "@koloda/app";
import { langAtom } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { SyncFirstRunJoin } from "./sync-first-run-join";

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

const PREVIEW: SpacePreview = { spaceName: "Study", counts: { decks: 1 }, bytes: 1000 };

function renderFirstRun(onReady: () => void, onJoined: () => void = vi.fn()) {
  const joined: JoinedSpace = { mode: "blank", knownIds: 0, status: status({ type: "bootstrapping" }) };
  const sync = {
    getDeviceNameQuery: () => ({ queryKey: ["sync", "device_name"], queryFn: async () => "laptop" }),
    // WHY: the screen reads the status the join and the engine's events leave in the cache.
    getStatusQuery: () => ({ queryKey: ["sync", "status"], queryFn: async () => joined.status, staleTime: Infinity }),
    previewMutation: () => ({ mutationFn: async () => PREVIEW }),
    joinMutation: () => ({ mutationFn: async () => joined }),
  } as unknown as SyncQueries;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const store = createStore();
  store.set(langAtom, "en");
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  }
  render(<SyncFirstRunJoin sync={sync} onJoined={onJoined} onReady={onReady} onCancel={vi.fn()} />, {
    wrapper: Wrapper,
  });
  return queryClient;
}

async function press(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

async function preview() {
  await screen.findByDisplayValue("laptop");
  fireEvent.change(screen.getByLabelText(/settings.sync.server-url.label/), { target: { value: "https://s.test" } });
  fireEvent.change(screen.getByLabelText(/settings.sync.invite.code/), { target: { value: "ABCDE12345" } });
  await press("settings.sync.join.continue");
  await screen.findByText("settings.sync.join.preview.space Study");
}

async function join() {
  await preview();
  await press("settings.sync.join.submit");
}

describe("SyncFirstRunJoin", () => {
  it("tells the setup screen once the join succeeds, not at the preview", async () => {
    const onJoined = vi.fn();
    renderFirstRun(vi.fn(), onJoined);
    await preview();
    expect(onJoined).not.toHaveBeenCalled();

    await press("settings.sync.join.submit");

    expect(onJoined).toHaveBeenCalledTimes(1);
  });

  it("waits for the space's first download before opening the app", async () => {
    const onReady = vi.fn();
    const queryClient = renderFirstRun(onReady);
    await join();

    expect(await screen.findByText("settings.sync.first-run.downloading")).not.toBeNull();
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      queryClient.setQueryData(["sync", "status"], status({ type: "bootstrapping" }, { lagHot: 30 }));
    });
    // WHY: the query cache tells its observers on a timer, so the screen updates a tick later.
    expect(await screen.findByText("settings.sync.download-left")).not.toBeNull();
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      queryClient.setQueryData(["sync", "status"], status({ type: "idle" }));
    });
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
  });

  it("says why the download waits at a change this app cannot read", async () => {
    const onReady = vi.fn();
    const queryClient = renderFirstRun(onReady);
    await join();

    await act(async () => {
      queryClient.setQueryData(
        ["sync", "status"],
        status({ type: "bootstrapping" }, { hold: { lane: "hot", seq: 4, reason: "updateRequired" } }),
      );
    });

    expect(await screen.findByText("settings.sync.hold.update-required")).not.toBeNull();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("keeps waiting through a stop, and says why it stopped", async () => {
    const onReady = vi.fn();
    const queryClient = renderFirstRun(onReady);
    await join();

    await act(async () => {
      queryClient.setQueryData(["sync", "status"], status({ type: "stopped", stop: { reason: "unreachable" } }));
    });

    expect(await screen.findByText("settings.sync.stop.unreachable")).not.toBeNull();
    expect(screen.getByText("settings.sync.first-run.downloading")).not.toBeNull();
    expect(onReady).not.toHaveBeenCalled();
  });
});
