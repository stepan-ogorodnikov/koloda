import { Button, Dialog, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AnimatePresence } from "motion/react";
import { useEffect, useRef } from "react";
import type { ActionDispatch, PropsWithChildren } from "react";
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
  const isSetupPhase = state.phase === "preparing" || state.phase === "configuring";
  const isStudying = state.phase === "studying" && !!state.session;
  const content = state.session?.content;

  useEffect(() => {
    if (!content?.form?.firstInputFieldId && content?.form?.isSubmitted === false) {
      submitRef?.current?.focus();
    }
  }, [content?.form?.firstInputFieldId, content?.form?.isSubmitted]);

  return (
    <LessonFooterLayout>
      <AnimatePresence mode="wait">
        {isSetupPhase && (
          <Fade key="submit">
            <Button
              variants={{ style: "primary" }}
              type="submit"
              isDisabled={!state.setup?.amounts.total}
              onClick={() => dispatch(["setupSubmitted"])}
            >
              {_(msg`lesson.init.submit`)}
            </Button>
          </Fade>
        )}
        {isStudying && (
          <AnimatePresence mode="wait">
            {content?.form.isSubmitted ? (
              <Fade key="grades">
                <LessonCardGrades grades={content.grades} />
              </Fade>
            ) : (
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
        {state.phase === "finished" && (
          <Fade key="close">
            <Button variants={{ style: "primary" }} onClick={() => dispatch(["close"])} autoFocus>
              {_(msg`lesson.completion.close`)}
            </Button>
          </Fade>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {state.isTerminationRequested && <Fade className={terminationDialogOverlay} key="overlay" />}
      </AnimatePresence>
    </LessonFooterLayout>
  );
}

export function LessonFooterLayout({ children }: PropsWithChildren) {
  return <Dialog.Footer variants={{ justify: "center", class: "relative min-h-20" }}>{children}</Dialog.Footer>;
}
