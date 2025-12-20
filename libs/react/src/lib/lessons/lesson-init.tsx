import { LESSON_TYPE_LABELS, LESSON_TYPES } from "@koloda/srs";
import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import type { ActionDispatch } from "react";
import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { queriesAtom } from "../queries";
import { lessonAtom } from "./lesson";
import { LessonInitAmount } from "./lesson-init-amount";
import { LessonInitAmountInput } from "./lesson-init-amount-input";
import { LessonInitLabel } from "./lesson-init-label";
import { LessonInitLearnedToday } from "./lesson-init-learned-today";
import { LessonInitTh } from "./lesson-init-th";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

type LessonInitProps = {
  state: LessonReducerState;
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonInit({ state, dispatch }: LessonInitProps) {
  const { _ } = useLingui();
  const { deckId } = useAtomValue(lessonAtom) || {};
  const { getTodayReviewTotalsQuery, getLessonsQuery } = useAtomValue(queriesAtom);
  const { data: learnedToday } = useQuery({
    queryKey: ["review_totals", "today"],
    ...getTodayReviewTotalsQuery(),
  });
  const { data: lessons } = useQuery({
    queryKey: ["lessons", JSON.stringify({ deckId })],
    ...getLessonsQuery(state.filters!),
  });

  useHotkeys("esc", () => dispatch(["isOpenUpdated", false]), { enableOnFormTags: true });

  useEffect(() => {
    if (learnedToday) dispatch(["todayReviewTotalsReceived", learnedToday]);
  }, [dispatch, learnedToday]);

  useEffect(() => {
    if (lessons) dispatch(["lessonsReceived", lessons]);
  }, [dispatch, lessons]);

  if (!state.todayReviewTotals || !state.lessons || !state.amounts) return null;

  const { dailyLimits, reviewTotals } = state.todayReviewTotals;
  const available = state.lessons[0];

  return (
    <>
      <Dialog.Content variants={{ class: "overflow-auto" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dispatch(["lessonStarted"]);
          }}
        >
          <table className="mb-4">
            <thead>
              <tr>
                <LessonInitTh />
                <LessonInitTh>{_(msg`lesson.init.table.columns.amount`)}</LessonInitTh>
                <LessonInitTh>{_(msg`lesson.init.table.columns.available`)}</LessonInitTh>
                <LessonInitTh>{_(msg`lesson.init.table.columns.learned`)}</LessonInitTh>
              </tr>
            </thead>
            <tbody>
              {LESSON_TYPES.map((type) => (
                <tr key={type}>
                  <LessonInitLabel>{_(LESSON_TYPE_LABELS[type])}</LessonInitLabel>
                  {type === "total"
                    ? <LessonInitAmount amount={state?.amounts?.total || 0} />
                    : <LessonInitAmountInput state={state} dispatch={dispatch} type={type} />}
                  <LessonInitAmount amount={available[type]} />
                  <LessonInitLearnedToday learned={reviewTotals[type]} limit={dailyLimits[type]} />
                </tr>
              ))}
            </tbody>
          </table>
          <button className="hidden" type="submit" />
        </form>
      </Dialog.Content>
      <Dialog.Footer>
        <Button
          variants={{ style: "primary" }}
          isDisabled={!state.amounts.total}
          onClick={() => dispatch(["lessonStarted"])}
        >
          {_(msg`lesson.init.submit`)}
        </Button>
      </Dialog.Footer>
    </>
  );
}
