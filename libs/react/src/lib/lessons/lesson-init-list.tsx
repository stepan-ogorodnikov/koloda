import { LESSON_TYPE_LABELS, LESSON_TYPES } from "@koloda/srs";
import { Number } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ActionDispatch } from "react";
import { LessonInitAmountInput } from "./lesson-init-amount-input";
import { LessonInitLearnedToday } from "./lesson-init-learned-today";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

type LessonInitListProps = {
  state: LessonReducerState;
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonInitList({ state, dispatch }: LessonInitListProps) {
  const { _ } = useLingui();
  if (!state.lessons || !state.todayReviewTotals) return null;
  const available = state.lessons[0];
  const { reviewTotals, dailyLimits } = state.todayReviewTotals;

  return (
    <div className="self-stretch flex flex-col gap-6">
      {LESSON_TYPES.map((type) => (
        <div key={type} className="flex flex-col gap-2 text-lg">
          <div className="flex flex-row items-center justify-between">
            <div className="font-medium fg-level-2">{_(LESSON_TYPE_LABELS[type])}</div>
            <LessonInitLearnedToday learned={reviewTotals[type]} limit={dailyLimits[type]} />
          </div>
          <div className="flex flex-row items-center justify-between">
            {type === "total"
              ? <Number className="flex flex-row items-center numbers-text" value={state?.amounts?.total || 0} />
              : <LessonInitAmountInput state={state} dispatch={dispatch} type={type} />}
            <div className="flex flex-row gap-2">
              <div className="font-medium">{_(msg`lesson.init.list.labels.available`)}</div>
              <div className="numbers-text">{available[type]}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
