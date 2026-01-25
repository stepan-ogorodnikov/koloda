import { useMotionSetting } from "@koloda/ui";
import { motion } from "motion/react";
import type { LessonReducerState } from "./lesson-reducer";

const lessonProgressAmountSign = "pb-0.5 fg-level-3 text-sm";

type LessonProgressAmountsProps = { state: LessonReducerState };

export function LessonProgressAmounts({ state }: LessonProgressAmountsProps) {
  const isMotionOn = useMotionSetting();
  if (!state.progress) return null;

  const { done, pending } = state.progress;

  return (
    <motion.div
      className="h-8 numbers-text leading-8"
      transition={{ duration: 0 }}
      key="progress-amounts"
    >
      <motion.div
        className="absolute right-1/2 flex flex-row items-center gap-1 mr-4"
        initial={{ opacity: 0, x: "-50%" }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0 }}
        transition={isMotionOn ? { duration: 0.25 } : { duration: 0 }}
        key="done"
      >
        <div className="fg-lesson-type-blue">{done.untouched}</div>
        <div className={lessonProgressAmountSign}>+</div>
        <div className="fg-lesson-type-red">{done.learn}</div>
        <div className={lessonProgressAmountSign}>+</div>
        <div className="fg-lesson-type-green">{done.review}</div>
        <div className={lessonProgressAmountSign}>=</div>
        <div className="">{done.total}</div>
      </motion.div>
      <motion.div
        className="absolute left-1/2 flex flex-row items-center gap-1 ml-4"
        initial={{ opacity: 0, x: "50%" }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0 }}
        transition={isMotionOn ? { duration: 0.25 } : { duration: 0 }}
        key="pending"
      >
        <div className="">{pending.total}</div>
        <div className={lessonProgressAmountSign}>=</div>
        <div className="fg-lesson-type-blue">{pending.untouched}</div>
        <div className={lessonProgressAmountSign}>+</div>
        <div className="fg-lesson-type-red">{pending.learn}</div>
        <div className={lessonProgressAmountSign}>+</div>
        <div className="fg-lesson-type-green">{pending.review}</div>
      </motion.div>
    </motion.div>
  );
}
