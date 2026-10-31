import { AppError } from "@koloda/app";
import { motionSettingAtom } from "@koloda/ui";
import { langAtom, queriesAtom, schemeAtom } from "@koloda/core-react";
import type * as CoreReact from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsInterface } from "./settings-interface";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
    i18n: { locale: "en" },
  }),
}));

// WHY: siblings here mock `@koloda/core-react` the same way; under `isolate: false` the first file to load `@koloda/ui`
// decides which module it binds to, so this file must not load the real one first.
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

// WORKAROUND: jsdom lacks getAnimations; react-aria's SharedElementTransition under the toggle group
// throws without it once the selection moves.
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}

function renderSettingsInterface(
  patchSettings = vi.fn(async ({ content }: { content: Record<string, unknown> }) => ({
    name: "interface",
    content,
  })),
) {
  const queries = {
    getSettingsQuery: (name: string) => ({ queryKey: ["settings", name], queryFn: async () => null }),
    patchSettingsMutation: () => ({ mutationFn: patchSettings }),
  } as unknown as Queries;
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], queries);
  store.set(langAtom, "en");
  store.set(schemeAtom, "light");
  store.set(motionSettingAtom, "off");
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

  render(<SettingsInterface />, { wrapper: Wrapper });
  return { store, patchSettings };
}

describe("SettingsInterface", () => {
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => {
    errors.push(event.error);
    event.preventDefault();
  };

  afterEach(() => {
    window.removeEventListener("error", onError);
    errors.length = 0;
  });

  it.each([
    ["scheme", "scheme.light", schemeAtom, "light"],
    ["motion", "motion.off", motionSettingAtom, "off"],
  ] as const)("keeps the selected %s option when it is pressed again", (_field, name, atom, value) => {
    window.addEventListener("error", onError);
    const { store, patchSettings } = renderSettingsInterface();

    const option = screen.getByRole("radio", { name });
    expect(option.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(option);

    expect(errors).toEqual([]);
    expect(option.getAttribute("aria-checked")).toBe("true");
    expect(store.get(atom)).toBe(value);
    expect(patchSettings).not.toHaveBeenCalled();
  });

  it("shows a failed write and puts the option back, then clears the alert after a good write", async () => {
    const patchSettings = vi
      .fn()
      .mockRejectedValueOnce(new AppError("db.update"))
      .mockResolvedValueOnce({ name: "interface", content: { scheme: "dark" } });
    const { store } = renderSettingsInterface(patchSettings);

    fireEvent.click(screen.getByRole("radio", { name: "scheme.dark" }));

    expect((await screen.findByRole("alert")).textContent).toContain("db.update");
    expect(store.get(schemeAtom)).toBe("light");

    fireEvent.click(screen.getByRole("radio", { name: "scheme.dark" }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(store.get(schemeAtom)).toBe("dark");
  });
});
