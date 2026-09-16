import { AnimatedNumber } from "@koloda/ui";

type LessonInitAmountProps = { amount: number };

export function LessonInitAmount({ amount }: LessonInitAmountProps) {
  return <AnimatedNumber className="flex items-center h-10 px-2.5 numbers-text" value={amount} />;
}
