import type { OptimizerQueries } from "@koloda/core-react";
import type { OptimizerProgressEvent } from "@koloda/native-ipc";
import { OPTIMIZER_PROGRESS_CHANNEL } from "@koloda/native-ipc";
import type { ApplyAlgorithmOptimizationData } from "@koloda/srs";
import { invoke } from "./electron";

export const createOptimizerQueries = (): OptimizerQueries => ({
  optimizeAlgorithm: async ({ id, onProgress, signal }) => {
    const requestId = crypto.randomUUID();
    // INVARIANT: listen before invoking, so the first progress event is not missed.
    const unsubscribe = window.electronAPI.on(OPTIMIZER_PROGRESS_CHANNEL, (event) => {
      const { requestId: eventRequestId, current, total } = event as OptimizerProgressEvent;
      if (eventRequestId === requestId) onProgress({ current, total });
    });
    const cancel = () => {
      void invoke("cmd_cancel_algorithm_optimization", { requestId }).catch(() => {});
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const run = invoke("cmd_optimize_algorithm", { requestId, id });
      // WHY: an abort before the start fires no event; cancel after the start so main already knows the run.
      if (signal.aborted) cancel();
      return await run;
    } finally {
      signal.removeEventListener("abort", cancel);
      unsubscribe();
    }
  },
  applyOptimizationMutation: () => ({
    mutationFn: (data: ApplyAlgorithmOptimizationData) => invoke("cmd_apply_algorithm_optimization", { data }),
  }),
});
