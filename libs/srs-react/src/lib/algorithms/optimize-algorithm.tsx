import { ERROR_MESSAGES, formatAppError } from "@koloda/app";
import { optimizerQueriesAtom, queryKeys } from "@koloda/core-react";
import type { OptimizationProgress, OptimizerQueries } from "@koloda/core-react";
import type { Algorithm, AlgorithmFitScores, AlgorithmOptimization } from "@koloda/srs";
import { BrainIcon, Button, Dialog, ErrorMessage } from "@koloda/ui";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";

type OptimizeAlgorithmProps = {
  id: Algorithm["id"];
  isDisabled: boolean;
  onApplied: (algorithm: Algorithm) => void;
};

type ImprovedOptimization = Extract<AlgorithmOptimization, { status: "improved" }>;

type OptimizationState =
  | { phase: "running"; progress: OptimizationProgress | null }
  | { phase: "done"; result: AlgorithmOptimization }
  | { phase: "failed"; error: unknown };

// INVARIANT: only the desktop provides the optimizer; on the web the editor shows no Optimize action.
export function OptimizeAlgorithm(props: OptimizeAlgorithmProps) {
  const optimizer = useAtomValue(optimizerQueriesAtom);
  if (!optimizer) return null;
  return <OptimizeAlgorithmDialog optimizer={optimizer} {...props} />;
}

type OptimizeAlgorithmDialogProps = OptimizeAlgorithmProps & { optimizer: OptimizerQueries };

function OptimizeAlgorithmDialog({ id, isDisabled, onApplied, optimizer }: OptimizeAlgorithmDialogProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { mutate, isPending } = useMutation(optimizer.applyOptimizationMutation());
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<OptimizationState>({ phase: "running", progress: null });
  const runRef = useRef<AbortController | null>(null);

  const stop = () => {
    runRef.current?.abort();
    runRef.current = null;
  };

  const start = () => {
    stop();
    const run = new AbortController();
    runRef.current = run;
    setState({ phase: "running", progress: null });
    // WHY: a stopped run still resolves (as cancelled); only the current run may update the dialog.
    optimizer
      .optimizeAlgorithm({
        id,
        signal: run.signal,
        onProgress: (progress) => {
          if (runRef.current === run) setState({ phase: "running", progress });
        },
      })
      .then((result) => {
        if (runRef.current === run) setState({ phase: "done", result });
      })
      .catch((error: unknown) => {
        if (runRef.current === run) setState({ phase: "failed", error });
      });
  };

  // INVARIANT: leaving the editor cancels a run, like closing the dialog does.
  useEffect(() => () => runRef.current?.abort(), []);

  const handleOpenChange = (isNextOpen: boolean) => {
    setIsOpen(isNextOpen);
    if (isNextOpen) start();
    else stop();
  };

  const handleApply = ({ basedOn, weights }: ImprovedOptimization) => {
    mutate(
      { id, basedOn, weights },
      {
        onSuccess: (returning) => {
          queryClient.invalidateQueries({ queryKey: queryKeys.algorithms.all() });
          queryClient.setQueryData(queryKeys.algorithms.detail(id), returning);
          onApplied(returning);
          handleOpenChange(false);
        },
        onError: (error) => {
          setState({ phase: "failed", error });
        },
      },
    );
  };

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button variants={{ style: "primary" }} isDisabled={isDisabled}>
        <BrainIcon className="size-5 min-w-5" strokeWidth={1.75} aria-hidden="true" />
        {_(msg`optimize-algorithm.trigger`)}
      </Button>
      <Dialog.Popover variants={{ class: "w-96" }}>
        <Dialog.Body aria-label={_(msg`optimize-algorithm.title`)}>
          <Dialog.Content variants={{ class: "gap-4 py-4" }}>
            {state.phase === "running" && <OptimizationRunning progress={state.progress} />}
            {state.phase === "done" && <OptimizationResult result={state.result} />}
            {state.phase === "failed" && (
              <ErrorMessage {...formatAppError(state.error, _, ERROR_MESSAGES["algorithms.optimizer.failed"])} />
            )}
          </Dialog.Content>
          <Dialog.Footer>
            <div className="grow" />
            {state.phase === "failed" && (
              <Button variants={{ style: "bordered" }} onPress={start}>
                {_(msg`optimize-algorithm.retry`)}
              </Button>
            )}
            {state.phase === "done" && state.result.status === "improved" ? (
              <>
                <Button variants={{ style: "bordered" }} onPress={() => handleOpenChange(false)}>
                  {_(msg`optimize-algorithm.discard`)}
                </Button>
                <Button
                  variants={{ style: "primary" }}
                  isDisabled={isPending}
                  onPress={() => {
                    if (state.result.status === "improved") handleApply(state.result);
                  }}
                >
                  {_(msg`optimize-algorithm.apply`)}
                </Button>
              </>
            ) : (
              <Button variants={{ style: "bordered" }} onPress={() => handleOpenChange(false)}>
                {state.phase === "running" ? _(msg`optimize-algorithm.cancel`) : _(msg`optimize-algorithm.close`)}
              </Button>
            )}
          </Dialog.Footer>
        </Dialog.Body>
      </Dialog.Popover>
    </Dialog.Root>
  );
}

type OptimizationRunningProps = { progress: OptimizationProgress | null };

function OptimizationRunning({ progress }: OptimizationRunningProps) {
  const { _ } = useLingui();
  const percentage = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <>
      <p>{_(msg`optimize-algorithm.running`)}</p>
      <div className="flex flex-row items-center gap-2">
        <div
          className="w-full h-2.5 rounded-full bg-progress-bar shadow-progress-bar overflow-hidden"
          role="progressbar"
          aria-label={_(msg`optimize-algorithm.running`)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
        >
          <div
            className="h-full rounded-full bg-progress-bar-fill shadow-progress-bar-fill"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="min-w-10 text-right fg-level-3 text-sm">{`${percentage}%`}</span>
      </div>
    </>
  );
}

type OptimizationResultProps = { result: AlgorithmOptimization };

function OptimizationResult({ result }: OptimizationResultProps) {
  const { _ } = useLingui();

  switch (result.status) {
    case "cancelled":
      return <p>{_(msg`optimize-algorithm.cancelled`)}</p>;
    case "notEnoughData":
      return <p>{_(msg`optimize-algorithm.not-enough-data`)}</p>;
    case "noImprovement":
    case "improved":
      return (
        <>
          <p>
            {result.status === "improved"
              ? _(msg`optimize-algorithm.improved`)
              : _(msg`optimize-algorithm.no-improvement`)}
          </p>
          <p className="fg-level-3">
            {_(msg`${plural(result.reviewCount, { other: "optimize-algorithm.review-count.#" })}`)}
          </p>
          <FitScoresTable current={result.current} optimized={result.optimized} />
        </>
      );
  }
}

type FitScoresTableProps = { current: AlgorithmFitScores; optimized: AlgorithmFitScores };

function FitScoresTable({ current, optimized }: FitScoresTableProps) {
  const { _ } = useLingui();
  const rows = [
    { label: _(msg`optimize-algorithm.scores.current`), scores: current },
    { label: _(msg`optimize-algorithm.scores.found`), scores: optimized },
  ];

  return (
    <table className="text-sm">
      <caption className="text-left fg-level-3 pb-1">{_(msg`optimize-algorithm.scores.caption`)}</caption>
      <thead>
        <tr className="fg-level-3">
          <th />
          <th className="text-right font-medium px-2">{_(msg`optimize-algorithm.scores.log-loss`)}</th>
          <th className="text-right font-medium px-2">{_(msg`optimize-algorithm.scores.rmse`)}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, scores }) => (
          <tr key={label}>
            <th className="text-left font-normal">{label}</th>
            <td className="text-right px-2 tabular-nums">{scores.logLoss.toFixed(4)}</td>
            <td className="text-right px-2 tabular-nums">{scores.rmse.toFixed(4)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
