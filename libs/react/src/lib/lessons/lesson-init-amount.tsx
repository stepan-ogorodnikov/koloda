type LessonInitAmountProps = { amount: number };

export function LessonInitAmount({ amount }: LessonInitAmountProps) {
  return (
    <div className="flex items-center h-10 px-2.5 numbers-text">
      {amount}
    </div>
  );
}
