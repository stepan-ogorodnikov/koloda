import { lessonsQueryKeys, queriesAtom, QueryState } from "@koloda/react";
import { LESSON_TYPE_LABELS, type LessonType } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { tv } from "tailwind-variants";

const learnedToday = [
  "flex flex-row border-main bg-level-2",
  "max-tb:self-stretch max-tb:justify-center max-tb:order-1 p-2 max-tb:rounded-t-xl max-tb:border-b-2",
  "tb:grow tb:flex-col tb:gap-4 tb:p-4 tb:rounded-lg tb:border-2",
].join(" ");

const learnedTodayAmount = tv({
  variants: {
    content: {
      title: "max-tb:hidden dt:text-lg font-bold leading-6 tracking-tight",
      value: "numbers-text tracking-tight",
    },
    type: {
      total: "",
      review: "fg-lesson-type-green",
      learn: "fg-lesson-type-red",
      untouched: "fg-lesson-type-blue",
    },
    isInfinity: {
      true: "pb-1 text-3xl font-medium leading-none",
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
  const query = useQuery({ queryKey: lessonsQueryKeys.todayReviewTotals(), ...getTodayReviewTotalsQuery() });

  return (
    <div className={learnedToday}>
      <h2 className="max-tb:hidden fg-level-2 leading-6">{_(msg`learned-today.title`)}</h2>
      <QueryState query={query}>
        {(data) => (
          <div className="flex flex-row tb:flex-col gap-6 py-2">
            {(["untouched", "learn", "review", "total"] as LessonType[]).map((type) => {
              const percentage = (data.reviewTotals[type] / (data.dailyLimits[type] || Infinity)) * 100;
              const isInfinity = data.dailyLimits[type] === 0;

              return (
                <div className="flex flex-col gap-2 text-xl leading-6" key={type}>
                  <div className="flex flex-row justify-between gap-1">
                    <div className={learnedTodayAmount({ content: "title", type })}>
                      {_(LESSON_TYPE_LABELS[type])}
                    </div>
                    <div className="flex flex-row items-center gap-1 h-6">
                      <span className={learnedTodayAmount({ content: "value", type })}>
                        {`${data.reviewTotals[type]}`}
                      </span>
                      <span className="fg-level-4 font-normal text-xs leading-6">/</span>
                      <span className={learnedTodayAmount({ content: "value", type, isInfinity })}>
                        {data.dailyLimits[type] === 0 ? "∞" : `${data.dailyLimits[type]}`}
                      </span>
                    </div>
                  </div>
                  <div className="max-tb:hidden w-full h-2 rounded-full bg-progress-bar shadow-progress-bar">
                    <div className={learnedTodayProgressBar({ type })} style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </QueryState>
    </div>
  );
}
