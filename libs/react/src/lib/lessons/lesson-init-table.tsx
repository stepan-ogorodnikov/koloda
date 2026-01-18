import { LESSON_TYPE_LABELS, LESSON_TYPES } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { LessonInitAmount } from "./lesson-init-amount";
import { LessonInitAmountInput } from "./lesson-init-amount-input";
import { LessonInitLabel } from "./lesson-init-label";
import { LessonInitLearnedToday } from "./lesson-init-learned-today";
import { LessonInitTd } from "./lesson-init-td";
import { LessonInitTh } from "./lesson-init-th";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

type LessonInitTableProps = {
  state: LessonReducerState;
  dispatch: (action: LessonReducerAction) => void;
};

export function LessonInitTable({ state, dispatch }: LessonInitTableProps) {
  const { _ } = useLingui();
  if (!state.lessons || !state.todayReviewTotals) return null;
  const available = state.lessons[0];
  const { reviewTotals, dailyLimits } = state.todayReviewTotals;

  return (
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
              ? (
                <LessonInitTd>
                  <LessonInitAmount amount={state?.amounts?.total || 0} />
                </LessonInitTd>
              )
              : (
                <LessonInitTd>
                  <LessonInitAmountInput state={state} dispatch={dispatch} type={type} />
                </LessonInitTd>
              )}
            <LessonInitTd>
              <LessonInitAmount amount={available[type]} />
            </LessonInitTd>
            <LessonInitTd>
              <LessonInitLearnedToday
                variants={{ table: true }}
                learned={reviewTotals[type]}
                limit={dailyLimits[type]}
              />
            </LessonInitTd>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
