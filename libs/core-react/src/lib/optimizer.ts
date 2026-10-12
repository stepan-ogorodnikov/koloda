import type { AppError } from "@koloda/app";
import type { Algorithm, AlgorithmOptimization, ApplyAlgorithmOptimizationData } from "@koloda/srs";
import type { UseMutationOptions } from "@tanstack/react-query";
import { atom } from "jotai";

/** Training steps done and planned in a running optimization. */
export type OptimizationProgress = { current: number; total: number };

export type OptimizeAlgorithmOptions = {
  id: Algorithm["id"];
  onProgress: (progress: OptimizationProgress) => void;
  /** Aborting cancels the run, which then resolves as `cancelled`. */
  signal: AbortSignal;
};

export type OptimizerQueries = {
  optimizeAlgorithm: (options: OptimizeAlgorithmOptions) => Promise<AlgorithmOptimization>;
  applyOptimizationMutation: () => UseMutationOptions<Algorithm, AppError, ApplyAlgorithmOptimizationData>;
};

// INVARIANT: set only by the desktop app, which runs the FSRS optimizer (docs/decisions/FSRS-OPTIMIZER.md).
// The web demo leaves it null, so it offers no optimization. Not a `Queries` method on purpose.
export const optimizerQueriesAtom = atom<OptimizerQueries | null>(null);
