import { optimizerQueriesAtom, queryKeys } from "@koloda/core-react";
import type { OptimizeAlgorithmOptions, OptimizerQueries } from "@koloda/core-react";
import type * as CoreReact from "@koloda/core-react";
import type { Algorithm, AlgorithmOptimization, ApplyAlgorithmOptimizationData } from "@koloda/srs";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren, ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { createAlgorithm, createQueryClient, testId } from "../../test/test-helpers";
import { OptimizeAlgorithm } from "./optimize-algorithm";

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

const ALGORITHM = createAlgorithm({ id: testId(1), title: "FSRS" });
const SCORES = { current: { logLoss: 0.8, rmse: 0.2 }, optimized: { logLoss: 0.5, rmse: 0.1 } };
const FOUND_WEIGHTS =
  "0.2, 1.3, 2.3, 8.3, 6.4, 0.8, 3, 0.001, 1.9, 0.2, 0.8, 1.5, 0.06, 0.3, 1.6, 0.6, 1.9, 0.5, 0.1, 0.07, 0.15";

type Optimizer = OptimizerQueries & {
  apply: ReturnType<typeof vi.fn<(data: ApplyAlgorithmOptimizationData) => Promise<Algorithm>>>;
  runs: OptimizeAlgorithmOptions[];
};

function optimizerResolving(result: AlgorithmOptimization | null): Optimizer {
  const runs: OptimizeAlgorithmOptions[] = [];
  const apply = vi.fn(async (data: ApplyAlgorithmOptimizationData) => ({
    ...ALGORITHM,
    content: { ...ALGORITHM.content, weights: data.weights },
  }));
  return {
    runs,
    apply,
    // WHY: `null` keeps the run in flight, so the test can close the dialog while it trains.
    optimizeAlgorithm: (options) => {
      runs.push(options);
      return result ? Promise.resolve(result) : new Promise<AlgorithmOptimization>(() => {});
    },
    applyOptimizationMutation: () => ({ mutationFn: apply }),
  };
}

function renderWith(element: ReactElement, optimizer: OptimizerQueries | null) {
  const store = createStore();
  store.set(optimizerQueriesAtom, optimizer);
  const queryClient = createQueryClient();

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  }

  return { ...render(element, { wrapper: Wrapper }), queryClient };
}

async function openDialog() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "optimize-algorithm.trigger" }));
  });
}

describe("OptimizeAlgorithm", () => {
  it("offers nothing without the desktop optimizer", () => {
    renderWith(<OptimizeAlgorithm id={ALGORITHM.id} isDisabled={false} onApplied={() => {}} />, null);

    expect(screen.queryByRole("button", { name: "optimize-algorithm.trigger" })).toBeNull();
  });

  it("applies found weights against the parameters the run read", async () => {
    const basedOn = ALGORITHM.content;
    const optimizer = optimizerResolving({
      status: "improved",
      reviewCount: 120,
      basedOn,
      weights: FOUND_WEIGHTS,
      ...SCORES,
    });
    const onApplied = vi.fn();
    const { queryClient } = renderWith(
      <OptimizeAlgorithm id={ALGORITHM.id} isDisabled={false} onApplied={onApplied} />,
      optimizer,
    );

    await openDialog();
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "optimize-algorithm.apply" }));
    });

    expect(optimizer.apply.mock.calls[0]?.[0]).toEqual({ id: ALGORITHM.id, basedOn, weights: FOUND_WEIGHTS });
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(onApplied.mock.calls[0]?.[0].content.weights).toBe(FOUND_WEIGHTS);
    expect(queryClient.getQueryData<Algorithm>(queryKeys.algorithms.detail(ALGORITHM.id))?.content.weights).toBe(
      FOUND_WEIGHTS,
    );
  });

  it.each([
    ["no improvement", { status: "noImprovement", reviewCount: 120, basedOn: ALGORITHM.content, ...SCORES }],
    ["not enough data", { status: "notEnoughData", reviewCount: 0, basedOn: ALGORITHM.content }],
  ] as const)("offers nothing to apply after %s", async (_case, result) => {
    renderWith(
      <OptimizeAlgorithm id={ALGORITHM.id} isDisabled={false} onApplied={() => {}} />,
      optimizerResolving(result as AlgorithmOptimization),
    );

    await openDialog();

    expect(await screen.findByRole("button", { name: "optimize-algorithm.close" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "optimize-algorithm.apply" })).toBeNull();
  });

  it("cancels a running optimization when the dialog closes", async () => {
    const optimizer = optimizerResolving(null);
    renderWith(<OptimizeAlgorithm id={ALGORITHM.id} isDisabled={false} onApplied={() => {}} />, optimizer);

    await openDialog();
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "optimize-algorithm.cancel" }));
    });

    expect(optimizer.runs).toHaveLength(1);
    expect(optimizer.runs[0]?.signal.aborted).toBe(true);
  });
});
