import { useMotionSetting } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
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
  const { _ } = useLingui();
  const isMotionOn = useMotionSetting();
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  const { index } = state.content || { index: 0 };
  const total = state.data?.cards.length || 0;

  return (
    <motion.div
      className="relative w-full h-4"
      aria-label={_(msg`lesson.progress.label ${index + 1} ${total}`)}
      aria-valuenow={index + 1}
      aria-valuemax={total}
      role="progressbar"
      initial={{ opacity: 0, y: "200%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={isMotionOn ? { duration: 0.25 } : { duration: 0 }}
      key="progress-dots"
    >
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
            <div className={lessonProgressCardDot({ isCurrent, type })} key={i} aria-hidden="true">
              {status === "success" && <CircleCheck className="size-4 stroke-2 fg-level-1" />}
              {status === "error" && <CircleAlert className="size-4 stroke-2 fg-level-1" />}
              {!status && <CircleDot className="size-4 stroke-2 fg-level-1" />}
            </div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
