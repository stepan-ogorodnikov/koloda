import type { LessonReducerState } from "./lesson-reducer";

const lessonProgressAmountSign = "pb-0.5 fg-level-3 text-sm";

type LessonProgressAmountsProps = { state: LessonReducerState };

export function LessonProgressAmounts({ state }: LessonProgressAmountsProps) {
  if (!state.progress) return null;

  const { done, pending } = state.progress;

  return (
    <div className="numbers-text">
      <div className="absolute right-1/2 flex flex-row items-center gap-1 mr-4">
        <div className="fg-lesson-type-blue">{done.untouched}</div>
        <div className={lessonProgressAmountSign}>+</div>
        <div className="fg-lesson-type-red">{done.learn}</div>
        <div className={lessonProgressAmountSign}>+</div>
        <div className="fg-lesson-type-green">{done.review}</div>
        <div className={lessonProgressAmountSign}>=</div>
        <div className="">{done.total}</div>
      </div>
      <div className="absolute left-1/2 flex flex-row items-center gap-1 ml-4">
        <div className="">{pending.total}</div>
        <div className={lessonProgressAmountSign}>=</div>
        <div className="fg-lesson-type-blue">{pending.untouched}</div>
        <div className={lessonProgressAmountSign}>+</div>
        <div className="fg-lesson-type-red">{pending.learn}</div>
        <div className={lessonProgressAmountSign}>+</div>
        <div className="fg-lesson-type-green">{pending.review}</div>
      </div>
    </div>
  );
}
