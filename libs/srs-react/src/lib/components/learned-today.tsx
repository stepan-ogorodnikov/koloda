import { queriesAtom, queryKeys } from "@koloda/core-react";
import { LESSON_TYPE_LABELS, type LessonType } from "@koloda/srs";
import { Main, QueryState } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { tv } from "tailwind-variants";

const learnedTodayAmount = tv({
  base: "leadning-none font-bold tracking-tight",
  variants: {
    content: {
      title: "max-wd:hidden wd:text-lg leading-6",
      value: "text-xl leading-none",
      limit: "fg-level-3 leading-none",
    },
    type: {
      total: "",
      review: "fg-lesson-type-green",
      learn: "fg-lesson-type-red",
      untouched: "fg-lesson-type-blue",
    },
    isInfinity: { true: "pb-0.5 text-2xl font-medium" },
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

const learnedTodayProgressPercentage = tv({
  base: "fg-level-3 min-w-10 text-right text-sm",
  variants: { isInfinity: { true: "pr-2" } },
});

export function LearnedToday() {
  const { _ } = useLingui();
  const { getTodayReviewTotalsQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: queryKeys.lessons.todayReviewTotals(), ...getTodayReviewTotalsQuery() });

  return (
    <>
      <Main.Titlebar variants={{ type: "sidebar" }}>
        <Main.H1>{_(msg`learned-today.title`)}</Main.H1>
      </Main.Titlebar>
      <Main.Container tabIndex={-1}>
        <QueryState query={query}>
          {(data) => (
            <div className="flex flex-col">
              {(["untouched", "learn", "review", "total"] as LessonType[]).map((type) => {
                const limit = type === "total" ? data.dailyLimits.total : data.dailyLimits[type].value;
                const percentage = (data.reviewTotals[type] / (limit || Infinity)) * 100;
                const isInfinity = limit === 0;
                const progressWidth = Math.min(Math.max(percentage, 0), 100);
                const progressLabel = isInfinity ? "–" : `${Math.round(progressWidth)}%`;

                return (
                  <div className="flex flex-col gap-2 leading-6 border-b-2 border-main py-2 px-4" key={type}>
                    <div className="flex flex-row items-center justify-between gap-1">
                      <div className={learnedTodayAmount({ content: "title", type })}>
                        {_(LESSON_TYPE_LABELS[type])}
                      </div>
                      <div className="flex flex-row items-center gap-1">
                        <span className={learnedTodayAmount({ content: "value", type })}>
                          {`${data.reviewTotals[type]}`}
                        </span>
                        <span className="fg-level-4 font-normal text-xs leading-8">/</span>
                        <span className={learnedTodayAmount({ content: "limit", isInfinity })}>
                          {limit === 0 ? "∞" : `${limit}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-row items-center gap-2">
                      <div className="w-full h-2.5 rounded-full bg-progress-bar shadow-progress-bar overflow-hidden">
                        <div
                          className={learnedTodayProgressBar({ type })}
                          style={{ width: `${progressWidth}%` }}
                        />
                      </div>
                      <span className={learnedTodayProgressPercentage({ isInfinity })}>
                        {progressLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </QueryState>
      </Main.Container>
    </>
  );
}
