import { CircleAlert, CircleCheck, CircleDot } from "lucide-react";
import { motion } from "motion/react";
import { tv } from "tailwind-variants";
import type { LessonReducerState } from "./lesson-reducer";
import { LESSON_PROGRESS_STATES } from "./lesson-reducer";

const lessonProgressCardDot = tv({
  base: "flex items-center justify-center size-4 rounded-full animate-colors",
  variants: {
    isCurrent: {
      true: "",
      false: "opacity-50",
    },
    type: {
      untouched: "bg-lesson-type-blue",
      learn: "bg-lesson-type-red",
      review: "bg-lesson-type-green",
    },
  },
});

type LessonProgressDotsProps = { state: LessonReducerState };

export function LessonProgressDots({ state }: LessonProgressDotsProps) {
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  const { index } = state.content || { index: 0 };

  return (
    <div className="relative w-full h-4">
      <motion.div
        className="absolute left-1/2 flex flex-row justify-center gap-2"
        initial={{ x: -0.5 * rem() }}
        animate={{ x: -0.5 * rem() - (index * 1.5 * rem()) }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {state.data?.cards.map((card, i) => {
          const isCurrent = i === index;
          const type = LESSON_PROGRESS_STATES[card.state as keyof typeof LESSON_PROGRESS_STATES] || "untouched";
          const status = state.upload.log[i];

          return (
            <div className={lessonProgressCardDot({ isCurrent, type })} key={i}>
              {status === "success" && <CircleCheck className="size-4 stroke-2 fg-level-1" />}
              {status === "error" && <CircleAlert className="size-4 stroke-2 fg-level-1" />}
              {!status && <CircleDot className="size-4 stroke-2 fg-level-1" />}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
