import { AppError } from "@koloda/app";
import { queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { RouteError } from "./route-error";

// WHY: real providers, not file-level `@lingui/react` or `@koloda/core-react` mocks — under `isolate: false` a
// sibling that loads `@koloda/ui` first keeps it bound to the real modules, so those mocks would not reach it.
// With no catalog loaded, text renders as its message id.
const i18n = setupI18n({ locale: "en", messages: { en: {} } });

function renderRouteError(error: Error, reset: () => void = () => {}) {
  const queries = {
    getSettingsQuery: (name: string) => ({ queryKey: ["settings", name], queryFn: async () => null }),
  } as unknown as Queries;
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], queries);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      </I18nProvider>
    );
  }

  return render(<RouteError error={error} reset={reset} />, { wrapper: Wrapper });
}

describe("RouteError", () => {
  it("shows a generic message and the raw error as details for plain errors", async () => {
    renderRouteError(new Error("boom"));

    const message = screen.getByText("route-error.message");
    expect(message.className).not.toContain("fg-error");
    expect(message.parentElement?.parentElement?.className).toContain("fg-level-2");

    fireEvent.click(screen.getByRole("button", { name: "error.details" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("translates known app error codes instead of the crash text", () => {
    renderRouteError(new AppError("db.get"));

    expect(screen.getByText("db.get")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "error.details" })).toBeNull();
  });

  it("retries rendering through the router reset next to a full reload button", () => {
    const reset = vi.fn();
    renderRouteError(new Error("boom"), reset);

    fireEvent.click(screen.getByRole("button", { name: "route-error.retry" }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "route-error.reload" })).toBeTruthy();
  });
});
