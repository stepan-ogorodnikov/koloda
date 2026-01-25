import { Button, Dialog, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AnimatePresence } from "motion/react";
import { type ActionDispatch, useEffect, useRef } from "react";
import { LessonCardGrades } from "./lesson-card-grades";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";
import { terminationDialogOverlay } from "./lesson-termination";

type LessonFooterProps = {
  state: LessonReducerState;
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonFooter({ state, dispatch }: LessonFooterProps) {
  const { _ } = useLingui();
  const submitRef = useRef<HTMLButtonElement>(null);
  const { isSubmitted, isStarted, isFinished } = state.meta;

  useEffect(() => {
    if (!state?.content?.form?.firstInputFieldId && state?.content?.form?.isSubmitted === false) {
      submitRef?.current?.focus();
    }
  }, [state?.content?.form?.firstInputFieldId, state?.content?.form?.isSubmitted]);

  return (
    <Dialog.Footer variants={{ justify: "center", class: "relative min-h-20" }}>
      <AnimatePresence mode="wait">
        {!isSubmitted && (
          <Fade key="submit">
            <Button
              variants={{ style: "primary" }}
              type="submit"
              isDisabled={!state?.amounts?.total}
              onClick={() => dispatch(["lessonSubmitted"])}
            >
              {_(msg`lesson.init.submit`)}
            </Button>
          </Fade>
        )}
        {isStarted && !isFinished && (
          <AnimatePresence mode="wait">
            {state.content?.form.isSubmitted
              ? (
                <Fade key="grades">
                  <LessonCardGrades grades={state.content.grades} dispatch={dispatch} />
                </Fade>
              )
              : (
                <Fade key="submit">
                  <Button
                    variants={{ style: "primary" }}
                    ref={submitRef}
                    onClick={() => dispatch(["cardSubmitted"])}
                    key="submit"
                  >
                    {_(msg`lesson.content.submit`)}
                  </Button>
                </Fade>
              )}
          </AnimatePresence>
        )}
        {isFinished && (
          <Fade key="close">
            <Button
              variants={{ style: "primary" }}
              onClick={() => dispatch(["isOpenUpdated", false])}
            >
              {_(msg`lesson.completion.close`)}
            </Button>
          </Fade>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {state.meta.isTerminationRequested && <Fade className={terminationDialogOverlay} key="overlay" />}
      </AnimatePresence>
    </Dialog.Footer>
  );
}
