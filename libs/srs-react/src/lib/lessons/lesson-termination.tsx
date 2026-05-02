import { Button, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AnimatePresence } from "motion/react";
import type { ActionDispatch } from "react";
import { FocusScope } from "react-aria";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

export const terminationDialogOverlay = [
  "absolute inset-0 flex flex-col items-center justify-center gap-4",
  "bg-level-1/80 backdrop-blur-xs",
].join(" ");

type LessonTerminationProps = {
  state: LessonReducerState;
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonTermination({ state, dispatch }: LessonTerminationProps) {
  const { _ } = useLingui();

  return (
    <AnimatePresence>
      {state.meta.isTerminationRequested && (
        <Fade className={terminationDialogOverlay} key="termination">
          <FocusScope contain autoFocus>
            <Button
              variants={{ style: "ghost" }}
              onClick={() => dispatch(["terminationRequested", false])}
            >
              {_(msg`lesson.content.termination.refuse`)}
            </Button>
            <Button
              variants={{ style: "primary" }}
              onClick={() => {
                dispatch(["isOpenUpdated", false]);
              }}
            >
              {_(msg`lesson.content.termination.accept`)}
            </Button>
          </FocusScope>
        </Fade>
      )}
    </AnimatePresence>
  );
}
