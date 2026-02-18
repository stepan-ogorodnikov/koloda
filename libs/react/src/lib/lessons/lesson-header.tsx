import { Dialog, useMotionSetting } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AnimatePresence, motion } from "motion/react";
import type { ActionDispatch, PropsWithChildren } from "react";
import { LessonProgressAmounts } from "./lesson-progress-amounts";
import { LessonProgressDots } from "./lesson-progress-dots";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";
import { LessonUploader } from "./lesson-uploader";

type LessonHeaderProps = {
  state: LessonReducerState;
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonHeader({ state, dispatch }: LessonHeaderProps) {
  const { _ } = useLingui();
  const isMotionOn = useMotionSetting();
  const { isSubmitted, isStarted, isFinished } = state.meta;

  return (
    <LessonHeaderLayout>
      <Dialog.Close
        variants={{ class: "absolute top-0 right-0" }}
        onClick={() => {
          if (isSubmitted && !isFinished) {
            dispatch(["terminationRequested", true]);
          } else {
            dispatch(["isOpenUpdated", false]);
          }
        }}
      />
      <AnimatePresence mode="wait">
        {!isSubmitted && (
          <motion.div
            className="place-self-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: "-100%" }}
            transition={isMotionOn ? { duration: 0.25 } : { duration: 0 }}
            key="title"
          >
            <Dialog.Title>
              {_(msg`lesson.init.title`)}
            </Dialog.Title>
          </motion.div>
        )}
      </AnimatePresence>
      {isStarted && <LessonProgressAmounts state={state} key="progress-amounts" />}
      {isStarted && <LessonProgressDots state={state} key="progress-dots" />}
      <LessonUploader state={state} dispatch={dispatch} />
    </LessonHeaderLayout>
  );
}

export function LessonHeaderLayout({ children }: PropsWithChildren) {
  return (
    <Dialog.Header variants={{ class: "overflow-hidden" }}>
      <div className="relative grow flex flex-col justify-center gap-4 h-16">
        {children}
      </div>
    </Dialog.Header>
  );
}
