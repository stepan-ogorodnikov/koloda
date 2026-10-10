import { AppError } from "@koloda/app";
import type { IssuedPairing } from "@koloda/app";
import type { SyncQueries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { SettingsSyncInvite } from "./settings-sync-invite";

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

const NOW = 1_760_000_000_000;

function renderInvite(issue: () => Promise<IssuedPairing>) {
  const sync = { issuePairingMutation: () => ({ mutationFn: issue }) } as unknown as SyncQueries;
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<SettingsSyncInvite sync={sync} />, { wrapper: Wrapper });
}

async function open() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "settings.sync.invite" }));
  });
}

describe("SettingsSyncInvite", () => {
  it("issues a code on open and shows it grouped, with the server address and the time left", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: NOW });
    const issue = vi.fn(async () => ({
      code: "ABCDE12345",
      expiresAt: NOW + 10 * 60 * 1000,
      serverUrl: "https://sync.example.test",
    }));
    renderInvite(issue);

    await open();

    expect(issue).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("ABCDE-12345")).not.toBeNull();
    expect(screen.getByText("https://sync.example.test")).not.toBeNull();
    expect(screen.getByText("settings.sync.invite.expires-in 10:00")).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByText("settings.sync.invite.expires-in 8:59")).not.toBeNull();
  });

  it("shows an expired code as expired, and New code issues another", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: NOW });
    const issue = vi
      .fn<() => Promise<IssuedPairing>>()
      .mockResolvedValueOnce({ code: "ABCDE12345", expiresAt: NOW + 5_000, serverUrl: "https://sync.example.test" })
      .mockResolvedValueOnce({ code: "FGHJK67890", expiresAt: NOW + 600_000, serverUrl: "https://sync.example.test" });
    renderInvite(issue);
    await open();
    await screen.findByText("ABCDE-12345");

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.queryByText("ABCDE-12345")).toBeNull();
    expect(screen.getByText("settings.sync.invite.expired")).not.toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "settings.sync.invite.new-code" }));
    });
    expect(await screen.findByText("FGHJK-67890")).not.toBeNull();
  });

  it("shows why no code was issued, and New code tries again", async () => {
    const issue = vi
      .fn<() => Promise<IssuedPairing>>()
      .mockRejectedValueOnce(new AppError("sync.unreachable", "connection refused"))
      .mockResolvedValueOnce({ code: "ABCDE12345", expiresAt: Date.now() + 600_000, serverUrl: "https://s.test" });
    renderInvite(issue);

    await open();

    expect(await screen.findByText("sync.unreachable")).not.toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "settings.sync.invite.new-code" }));
    });
    expect(await screen.findByText("ABCDE-12345")).not.toBeNull();
  });
});
