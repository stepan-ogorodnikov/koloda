import { lessonQueryKeys, queriesAtom } from "@koloda/react";
import { LESSON_TYPE_LABELS, type LessonType } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { tv } from "tailwind-variants";

const learnedToday = [
  "flex flex-row border-main bg-level-2 text-xl leading-6",
  "max-tb:self-stretch max-tb:justify-center max-tb:order-1 p-2 max-tb:rounded-t-xl max-tb:border-b-2",
  "tb:grow tb:flex-col tb:gap-4 tb:p-4 tb:rounded-lg tb:border-2",
].join(" ");

const learnedTodayAmount = tv({
  base: "font-semibold",
  variants: {
    type: {
      total: "",
      review: "fg-lesson-type-green",
      learn: "fg-lesson-type-red",
      untouched: "fg-lesson-type-blue",
    },
    isInfinity: {
      true: "pb-1.25 text-3xl leading-none font-normal",
      false: "",
    },
  },
});

const learnedTodayProgressBar = tv({
  base: "h-full rounded-full shadow-progress-bar-fill",
  variants: {
    type: {
      total: "bg-progress-bar-fill",
      review: "bg-fg-lesson-type-green",
      learn: "bg-fg-lesson-type-red",
      untouched: "bg-fg-lesson-type-blue",
    },
  },
});

export function LearnedToday() {
  const { _ } = useLingui();
  const { getTodayReviewTotalsQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({
    queryKey: lessonQueryKeys.todayReviewTotals(),
    ...getTodayReviewTotalsQuery(),
  });

  if (!data) return null;

  return (
    <div className={learnedToday}>
      <h2 className="max-tb:hidden font-medium leading-6">{_(msg`learned-today.title`)}</h2>
      <div className="flex flex-row tb:flex-col gap-6 py-2">
        {(["untouched", "learn", "review", "total"] as LessonType[]).map((type) => {
          const percentage = (data.reviewTotals[type] / data.dailyLimits[type]) * 100;

          return (
            <div className="flex flex-col gap-2" key={type}>
              <div className="flex flex-row justify-between gap-1">
                <div
                  className={learnedTodayAmount({ type, class: "max-tb:hidden dt:text-lg leading-6 tracking-wide" })}
                >
                  {_(LESSON_TYPE_LABELS[type])}
                </div>
                <div className="flex flex-row items-center gap-1 h-6">
                  <span className={learnedTodayAmount({ type })}>{`${data.reviewTotals[type]}`}</span>
                  <span className="fg-level-4 font-normal text-xs leading-6">/</span>
                  {data.dailyLimits[type] === Infinity
                    ? <span className={learnedTodayAmount({ type, isInfinity: true })}>∞</span>
                    : <span className={learnedTodayAmount({ type })}>{`${data.dailyLimits[type]}`}</span>}
                </div>
              </div>
              <div className="max-tb:hidden w-full h-2 rounded-full bg-progress-bar shadow-progress-bar">
                <div className={learnedTodayProgressBar({ type })} style={{ width: `${percentage}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
