import { queriesAtom } from "@koloda/react";
import type { LessonType } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { tv } from "tailwind-variants";

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

export function LearnedToday() {
  const { _ } = useLingui();
  const { getTodayReviewTotalsQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({
    queryKey: ["review_totals", "today"],
    ...getTodayReviewTotalsQuery(),
  });

  if (!data) return null;

  return (
    <div className="flex flex-row items-center gap-4 h-18 p-4 text-lg leading-10">
      <h2 className="pb-1 font-medium leading-10">{_(msg`learned-today.title`)}</h2>
      {(["total", "review", "learn", "untouched"] as LessonType[]).map((type) => (
        <div className="flex flex-row items-center gap-1" key={type}>
          <span className={learnedTodayAmount({ type })}>{`${data.reviewTotals[type]}`}</span>
          <span className="fg-level-4 font-normal text-base">/</span>
          {data.dailyLimits[type] === Infinity
            ? <span className={learnedTodayAmount({ type, isInfinity: true })}>∞</span>
            : <span className={learnedTodayAmount({ type })}>{`${data.dailyLimits[type]}`}</span>}
        </div>
      ))}
    </div>
  );
}
