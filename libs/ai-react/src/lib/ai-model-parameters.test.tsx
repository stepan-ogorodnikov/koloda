import type { ModelParameter } from "@koloda/ai";
import { queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { WritableAtom } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { AIModelParameters } from "./ai-model-parameters";
import type { AIModelParametersProps } from "./ai-model-parameters";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

const LEVELS = [
  { effort: "low", description: "" },
  { effort: "high", description: "" },
];

function effort(overrides: Partial<ModelParameter>): ModelParameter {
  return { type: "reasoning_effort", value: "", levels: LEVELS, hasDefault: false, ...overrides };
}

// The listbox reads hotkey settings; no stored row means the defaults.
function renderParameters(props: AIModelParametersProps) {
  const store = createStore();
  store.set(
    queriesAtom as WritableAtom<Queries, [Queries], unknown>,
    {
      getSettingsQuery: () => ({ queryKey: ["settings", "hotkeys"], queryFn: async () => null }),
    } as unknown as Queries,
  );
  const queryClient = new QueryClient();

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  }

  return render(<AIModelParameters {...props} />, { wrapper: Wrapper });
}

function openPicker() {
  const trigger = screen.getByRole("button", { name: /ai.model-parameters.reasoning-effort.label/ });
  fireEvent.click(trigger);
  return { trigger, options: within(screen.getByRole("listbox")).getAllByRole("option") };
}

describe("AIModelParameters reasoning effort", () => {
  it("offers Default first for a model without a default and shows it while no level is stored", () => {
    renderParameters({ parameters: [effort({})], onChange: () => {} });

    const { trigger, options } = openPicker();

    expect(options.map((option) => option.textContent)).toEqual([
      "ai.model-parameters.reasoning-effort.default",
      "low",
      "high",
    ]);
    expect(trigger.textContent).toContain("ai.model-parameters.reasoning-effort.default");
  });

  it("clears the stored level when Default is chosen", () => {
    const onChange = vi.fn();
    renderParameters({ parameters: [effort({ value: "high" })], onChange });

    const { options } = openPicker();
    fireEvent.click(options[0]!);

    expect(onChange).toHaveBeenCalledWith("reasoning_effort", "");
  });

  it("lists only the model's levels when the model has a default", () => {
    renderParameters({ parameters: [effort({ value: "low", hasDefault: true })], onChange: () => {} });

    const { options } = openPicker();

    expect(options.map((option) => option.textContent)).toEqual(["low", "high"]);
  });
});
