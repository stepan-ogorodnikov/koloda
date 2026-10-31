import { AppError } from "@koloda/app";
import { queriesAtom, schemeAtom } from "@koloda/core-react";
import type * as CoreReact from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { useInterfaceSettingWrite, useInterfaceSettingWriteError } from "./use-interface-setting-write";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

// WHY: siblings here mock `@lingui/react` and `@koloda/core-react` the same way; under `isolate: false` the first file to load `@koloda/ui`
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

function deferred() {
  let reject!: (error: unknown) => void;
  const promise = new Promise<never>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}

function renderWrite(patchSettings: () => Promise<unknown>) {
  const queries = {
    patchSettingsMutation: () => ({ mutationFn: patchSettings }),
  } as unknown as Queries;
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], queries);
  store.set(schemeAtom, "light");
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  }

  const { result } = renderHook(() => ({ write: useInterfaceSettingWrite(), error: useInterfaceSettingWriteError() }), {
    wrapper: Wrapper,
  });
  return { store, result };
}

describe("useInterfaceSettingWrite", () => {
  it("applies the value at once and puts it back when the save fails", async () => {
    const save = deferred();
    const { store, result } = renderWrite(() => save.promise);

    act(() => result.current.write("scheme", "dark"));
    await waitFor(() => expect(store.get(schemeAtom)).toBe("dark"));

    const error = new AppError("db.update");
    await act(async () => save.reject(error));

    await waitFor(() => expect(result.current.error).toBe(error));
    expect(store.get(schemeAtom)).toBe("light");
  });

  it("leaves a newer value alone when an older save fails", async () => {
    const save = deferred();
    const { store, result } = renderWrite(() => save.promise);

    act(() => result.current.write("scheme", "dark"));
    await waitFor(() => expect(store.get(schemeAtom)).toBe("dark"));
    // A later change to the same field lands while the first save is still pending
    store.set(schemeAtom, "system");

    await act(async () => save.reject(new AppError("db.update")));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(store.get(schemeAtom)).toBe("system");
  });

  it("clears the error once a later write succeeds", async () => {
    const patchSettings = vi
      .fn()
      .mockRejectedValueOnce(new AppError("db.update"))
      .mockResolvedValueOnce({ name: "interface", content: { scheme: "system" } });
    const { store, result } = renderWrite(patchSettings);

    act(() => result.current.write("scheme", "dark"));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.write("scheme", "system"));
    await waitFor(() => expect(patchSettings).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(store.get(schemeAtom)).toBe("system");
  });
});
