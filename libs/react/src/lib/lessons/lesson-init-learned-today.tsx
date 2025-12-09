import { LessonInitTd } from "./lesson-init-td";

type LessonInitLearnedTodayProps = {
  learned: number;
  limit: number;
};

export function LessonInitLearnedToday({ learned, limit }: LessonInitLearnedTodayProps) {
  return (
    <LessonInitTd>
      <div className="flex flex-row items-center gap-1 px-3 text-lg leading-6 font-semibold tracking-wider">
        <span>{learned}</span>
        <span className="fg-level-4 text-xs leading-6 font-normal">/</span>
        {limit === Infinity
          ? <span className="pb-1 text-3xl font-normal">∞</span>
          : <span>{limit}</span>}
      </div>
    </LessonInitTd>
  );
}
