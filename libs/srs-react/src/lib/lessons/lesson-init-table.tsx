import { LESSON_TYPE_LABELS, LESSON_TYPES } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue } from "jotai";
import { LessonInitAmount } from "./lesson-init-amount";
import { LessonInitAmountInput } from "./lesson-init-amount-input";
import { LessonInitLabel } from "./lesson-init-label";
import { LessonInitLearnedToday } from "./lesson-init-learned-today";
import { LessonInitTd } from "./lesson-init-td";
import { LessonInitTh } from "./lesson-init-th";
import { lessonSetupAtom } from "./lesson-selectors";

export function LessonInitTable() {
  const { _ } = useLingui();
  const setup = useAtomValue(lessonSetupAtom);
  if (!setup) return null;
  const { available, reviewTotals, dailyLimits } = setup;

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
            {type === "total" ? (
              <LessonInitTd>
                <LessonInitAmount amount={setup.amounts.total || 0} />
              </LessonInitTd>
            ) : (
              <LessonInitTd>
                <LessonInitAmountInput type={type} />
              </LessonInitTd>
            )}
            <LessonInitTd>
              <LessonInitAmount amount={available[type]} />
            </LessonInitTd>
            <LessonInitTd>
              <LessonInitLearnedToday
                variants={{ table: true }}
                learned={reviewTotals[type]}
                limit={type === "total" ? dailyLimits.total : dailyLimits[type].value}
              />
            </LessonInitTd>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
