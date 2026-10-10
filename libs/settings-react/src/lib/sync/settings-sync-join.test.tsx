import { AppError } from "@koloda/app";
import type { ImportMode, JoinData, JoinedSpace, PreviewRequest, SpacePreview, SyncStatus } from "@koloda/app";
import { langAtom } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { SettingsSyncJoin } from "./settings-sync-join";

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

const STATUS: SyncStatus = {
  state: { type: "bootstrapping" },
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

const PREVIEW: SpacePreview = { spaceName: "Study", counts: { decks: 2, cards: 40, reviews: 900 }, bytes: 2_500_000 };

type Calls = {
  preview?: (data: PreviewRequest) => Promise<SpacePreview>;
  join?: (data: JoinData) => Promise<JoinedSpace>;
  importData?: (mode: ImportMode) => Promise<SyncStatus>;
};

function renderJoin({ preview = async () => PREVIEW, join = vi.fn(), importData = vi.fn() }: Calls) {
  const sync = {
    getDeviceNameQuery: () => ({ queryKey: ["sync", "device_name"], queryFn: async () => "laptop" }),
    previewMutation: () => ({ mutationFn: preview }),
    joinMutation: () => ({ mutationFn: join }),
    importMutation: () => ({ mutationFn: importData }),
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
  render(<SettingsSyncJoin sync={sync} />, { wrapper: Wrapper });
  return queryClient;
}

async function press(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

async function previewSpace() {
  await press("settings.sync.join");
  await screen.findByDisplayValue("laptop");
  fireEvent.change(screen.getByLabelText(/settings.sync.server-url.label/), {
    target: { value: " https://sync.example.test " },
  });
  fireEvent.change(screen.getByLabelText(/settings.sync.invite.code/), { target: { value: " abcde-12345 " } });
  await press("settings.sync.join.continue");
  await screen.findByText("settings.sync.join.preview.space Study");
}

function joined(mode: JoinedSpace["mode"], knownIds = 0): JoinedSpace {
  return { mode, knownIds, status: STATUS };
}

describe("SettingsSyncJoin", () => {
  it("previews the space before using the code, and uses it only on Join", async () => {
    const preview = vi.fn(async () => PREVIEW);
    const join = vi.fn(async () => joined("untouchedSeed"));
    const queryClient = renderJoin({ preview, join });

    await previewSpace();

    expect(preview).toHaveBeenCalledWith(
      { serverUrl: "https://sync.example.test", code: "abcde-12345" },
      expect.anything(),
    );
    expect(join).not.toHaveBeenCalled();

    await press("settings.sync.join.submit");

    expect(join).toHaveBeenCalledWith(
      { serverUrl: "https://sync.example.test", code: "abcde-12345", deviceName: "laptop" },
      expect.anything(),
    );
    expect(queryClient.getQueryData(["sync", "status"])).toBe(STATUS);
    expect(screen.queryByRole("button", { name: "settings.sync.join.submit" })).toBeNull();
  });

  it("shows why a join was refused and keeps the preview", async () => {
    renderJoin({
      join: async () => {
        throw new AppError("sync.attached-elsewhere", "this file cannot join that space");
      },
    });
    await previewSpace();

    await press("settings.sync.join.submit");

    expect(await screen.findByText("sync.attached-elsewhere")).not.toBeNull();
    expect(screen.getByText("settings.sync.join.preview.space Study")).not.toBeNull();
  });

  it("keeps the form's values when going back from the preview", async () => {
    renderJoin({});
    await previewSpace();

    await press("settings.sync.back");

    expect(screen.getByDisplayValue("https://sync.example.test")).not.toBeNull();
    expect(screen.getByDisplayValue("abcde-12345")).not.toBeNull();
  });
});
