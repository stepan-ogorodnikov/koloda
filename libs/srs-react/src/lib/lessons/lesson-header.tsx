import { Dialog, useMotionSetting } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import type { PropsWithChildren } from "react";
import { requestLessonTerminationAtom } from "./lesson-actions";
import { LessonProgressAmounts } from "./lesson-progress-amounts";
import { LessonProgressDots } from "./lesson-progress-dots";
import { lessonHasSessionAtom, lessonPhaseAtom } from "./lesson-selectors";
import { useLessonClose } from "./use-lesson-close";

export function LessonHeader() {
  // INVARIANT: Do not call useLessonSession() from header; it would remount queries/effects.
  const { _ } = useLingui();
  const isMotionOn = useMotionSetting();
  const phase = useAtomValue(lessonPhaseAtom);
  // INVARIANT: Session remains through finished; do not gate progress on studying only.
  const hasSession = useAtomValue(lessonHasSessionAtom);
  const requestTermination = useSetAtom(requestLessonTerminationAtom);
  const { closeLesson } = useLessonClose();
  const isSetupPhase = phase === "preparing" || phase === "configuring";
  const shouldRequestTermination = phase === "loading-cards" || phase === "studying";

  return (
    <LessonHeaderLayout>
      <Dialog.Close
        variants={{ class: "absolute top-0 right-0" }}
        onClick={() => {
          if (shouldRequestTermination) {
            requestTermination();
          } else {
            closeLesson();
          }
        }}
      />
      <AnimatePresence mode="wait">
        {isSetupPhase && (
          <motion.div
            className="place-self-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: "-100%" }}
            transition={isMotionOn ? { duration: 0.25 } : { duration: 0 }}
            key="title"
          >
            <Dialog.Title>{_(msg`lesson.init.title`)}</Dialog.Title>
          </motion.div>
        )}
      </AnimatePresence>
      {hasSession && <LessonProgressAmounts key="progress-amounts" />}
      {hasSession && <LessonProgressDots key="progress-dots" />}
    </LessonHeaderLayout>
  );
}

export function LessonHeaderLayout({ children }: PropsWithChildren) {
  return (
    <Dialog.Header variants={{ class: "overflow-hidden" }}>
      <div className="relative grow flex flex-col justify-center gap-4 h-16">{children}</div>
    </Dialog.Header>
  );
}
