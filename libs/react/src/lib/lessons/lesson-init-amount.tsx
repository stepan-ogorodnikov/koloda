import { LessonInitTd } from "./lesson-init-td";

type LessonInitAmountProps = { amount: number };

export function LessonInitAmount({ amount }: LessonInitAmountProps) {
  return (
    <LessonInitTd>
      <div className="flex items-center h-10 px-3 numbers-text">
        {amount}
      </div>
    </LessonInitTd>
  );
}
