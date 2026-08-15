import { Button, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence } from "motion/react";
import { FocusScope } from "react-aria";
import { cancelLessonTerminationAtom } from "./lesson-actions";
import { lessonTerminationRequestedAtom } from "./lesson-selectors";
import { useLessonClose } from "./use-lesson-close";

export const terminationDialogOverlay = [
  "absolute inset-0 flex flex-col items-center justify-center gap-4",
  "bg-level-1/80 backdrop-blur-xs",
].join(" ");

export function LessonTermination() {
  const { _ } = useLingui();
  const isTerminationRequested = useAtomValue(lessonTerminationRequestedAtom);
  const cancelTermination = useSetAtom(cancelLessonTerminationAtom);
  const { closeLesson } = useLessonClose();

  return (
    <AnimatePresence>
      {isTerminationRequested && (
        <Fade className={terminationDialogOverlay} key="termination">
          <FocusScope contain autoFocus>
            <Button variants={{ style: "ghost" }} onClick={() => cancelTermination()}>
              {_(msg`lesson.content.termination.refuse`)}
            </Button>
            <Button variants={{ style: "primary" }} onClick={() => closeLesson()}>
              {_(msg`lesson.content.termination.accept`)}
            </Button>
          </FocusScope>
        </Fade>
      )}
    </AnimatePresence>
  );
}
