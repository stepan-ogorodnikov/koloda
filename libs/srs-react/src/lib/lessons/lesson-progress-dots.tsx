import { CircleIcon, ErrorIcon, PlayIcon, SuccessIcon, useMotionSetting } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue } from "jotai";
import { motion } from "motion/react";
import { tv } from "tailwind-variants";
import { LESSON_PROGRESS_STATES } from "./lesson-reducer";
import type { LessonResultUploadStatus } from "./lesson-reducer";
import { lessonContentAtom, lessonSessionCardsAtom, lessonUploadLogAtom } from "./lesson-selectors";

const lessonProgressCardDot = tv({
  base: "flex items-center justify-center size-4 rounded-full animate-colors",
  variants: {
    isCurrent: { false: "opacity-50" },
    type: {
      untouched: "bg-lesson-type-blue",
      learn: "bg-lesson-type-red",
      review: "bg-lesson-type-green",
    },
  },
});

export type LessonProgressDot = {
  type: (typeof LESSON_PROGRESS_STATES)[keyof typeof LESSON_PROGRESS_STATES];
  status?: LessonResultUploadStatus;
  isCurrent: boolean;
};

export function LessonProgressDots() {
  const { index } = useAtomValue(lessonContentAtom) || { index: 0 };
  const cards = useAtomValue(lessonSessionCardsAtom);
  const uploadLog = useAtomValue(lessonUploadLogAtom);
  const dots = (cards ?? []).map((card, i) => ({
    type: LESSON_PROGRESS_STATES[card.state as keyof typeof LESSON_PROGRESS_STATES] || "untouched",
    status: uploadLog[i],
    isCurrent: i === index,
  }));

  return <LessonProgressDotsView dots={dots} index={index} />;
}

export type LessonProgressDotsViewProps = {
  dots: LessonProgressDot[];
  index: number;
};

export function LessonProgressDotsView({ dots, index }: LessonProgressDotsViewProps) {
  const { _ } = useLingui();
  const isMotionOn = useMotionSetting();
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  const total = dots.length;

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
        animate={{ x: -0.5 * rem() - index * 1.5 * rem() }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {dots.map(({ type, status, isCurrent }, i) => (
          <div className={lessonProgressCardDot({ isCurrent, type })} key={i} aria-hidden="true">
            {status === "success" && <SuccessIcon className="size-4 min-w-4" strokeWidth={2} aria-hidden="true" />}
            {status === "error" && <ErrorIcon className="size-4 min-w-4" strokeWidth={2} aria-hidden="true" />}
            {!status && !isCurrent && <CircleIcon className="size-4 min-w-4" strokeWidth={2} aria-hidden="true" />}
            {!status && isCurrent && <PlayIcon className="size-4 min-w-4" strokeWidth={2} aria-hidden="true" />}
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
