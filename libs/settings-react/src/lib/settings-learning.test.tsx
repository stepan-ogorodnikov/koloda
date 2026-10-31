import { DEFAULT_LEARNING_SETTINGS } from "@koloda/app";
import type { ResolvedLearningSettings } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type * as CoreReact from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { DailyLimitCapField, SettingsLearning } from "./settings-learning";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

vi.mock("@koloda/core-react", async (importOriginal) => {
  const actual = await importOriginal<typeof CoreReact>();
  return {
    ...actual,
    useAppHotkey: () => {},
    useHotkeysSettings: () => ({
      ui: { close: ["Escape"] },
      form: { submit: ["Control+Enter"], reset: ["Escape"] },
    }),
  };
});

function renderSettingsLearning(data: ResolvedLearningSettings) {
  const setSettings = vi.fn(async ({ content }: { content: ResolvedLearningSettings }) => ({
    name: "learning",
    content,
  }));
  const queries = {
    getAlgorithmsQuery: () => ({ queryKey: ["algorithms"], queryFn: async () => [] }),
    getTemplatesQuery: () => ({ queryKey: ["templates"], queryFn: async () => [] }),
    setSettingsMutation: () => ({ mutationFn: setSettings }),
  } as unknown as Queries;
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], queries);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  }

  const view = render(<SettingsLearning data={data} />, { wrapper: Wrapper });
  return { ...view, queryClient, setSettings };
}

describe("SettingsLearning", () => {
  it("marks today's totals stale after a save, since they carry the limits and the day window", async () => {
    const { container, queryClient, setSettings } = renderSettingsLearning(DEFAULT_LEARNING_SETTINGS);
    const totalsKey = queryKeys.lessons.todayReviewTotals();
    queryClient.setQueryData(totalsKey, {});
    expect(queryClient.getQueryState(totalsKey)?.isInvalidated).toBe(false);

    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(setSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(queryClient.getQueryState(totalsKey)?.isInvalidated).toBe(true));
  });
});

describe("DailyLimitCapField", () => {
  it("writes null when Unlimited is turned on and restores the last number when turned off", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DailyLimitCapField label="Total" unlimitedLabel="Unlimited" value={8} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Unlimited" }));
    expect(onChange).toHaveBeenLastCalledWith(null);

    rerender(<DailyLimitCapField label="Total" unlimitedLabel="Unlimited" value={null} onChange={onChange} />);
    expect((screen.getByRole("textbox", { name: "Total" }) as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("switch", { name: "Unlimited" }));
    expect(onChange).toHaveBeenLastCalledWith(8);
  });
});
