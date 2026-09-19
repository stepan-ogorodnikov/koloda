import type { TWVProps } from "@koloda/ui";
import { tv } from "tailwind-variants";

const lessonInitLearnedToday = tv({
  base: "flex flex-row items-center gap-1 numbers-text leading-6",
  variants: {
    table: {
      true: "px-3",
    },
  },
});

type LessonInitLearnedTodayProps = TWVProps<typeof lessonInitLearnedToday> & {
  learned: number;
  limit: number | null;
};

export function LessonInitLearnedToday({ variants, learned, limit }: LessonInitLearnedTodayProps) {
  const showInfinity = limit == null;

  return (
    <div className={lessonInitLearnedToday(variants)}>
      <span>{learned}</span>
      <span className="fg-level-4 text-xs leading-6 font-normal">/</span>
      {showInfinity ? <span className="pb-1 text-3xl font-normal">∞</span> : <span>{limit}</span>}
    </div>
  );
}
