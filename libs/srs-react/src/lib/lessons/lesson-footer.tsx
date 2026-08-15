import { Button, Dialog, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence } from "motion/react";
import { useEffect, useRef } from "react";
import type { PropsWithChildren } from "react";
import { submitLessonCardAtom, submitLessonSetupAtom } from "./lesson-actions";
import { LessonCardGrades } from "./lesson-card-grades";
import {
  lessonAmountsAtom,
  lessonContentAtom,
  lessonHasSessionAtom,
  lessonPhaseAtom,
  lessonTerminationRequestedAtom,
} from "./lesson-selectors";
import { terminationDialogOverlay } from "./lesson-termination";
import { useLessonClose } from "./use-lesson-close";

export function LessonFooter() {
  // INVARIANT: Do not call useLessonSession() from footer; it would remount queries/effects.
  const { _ } = useLingui();
  const submitRef = useRef<HTMLButtonElement>(null);
  const phase = useAtomValue(lessonPhaseAtom);
  const amounts = useAtomValue(lessonAmountsAtom);
  const hasSession = useAtomValue(lessonHasSessionAtom);
  const content = useAtomValue(lessonContentAtom);
  const isTerminationRequested = useAtomValue(lessonTerminationRequestedAtom);
  const submitSetup = useSetAtom(submitLessonSetupAtom);
  const submitCard = useSetAtom(submitLessonCardAtom);
  const { closeLesson } = useLessonClose();
  const isSetupPhase = phase === "preparing" || phase === "configuring";
  const isStudying = phase === "studying" && hasSession;
  const firstInputFieldId = content?.form?.firstInputFieldId;
  const isFormSubmitted = content?.form?.isSubmitted;

  useEffect(() => {
    if (!firstInputFieldId && isFormSubmitted === false) {
      submitRef?.current?.focus();
    }
  }, [firstInputFieldId, isFormSubmitted]);

  return (
    <LessonFooterLayout>
      <AnimatePresence mode="wait">
        {isSetupPhase && (
          <Fade key="submit">
            <Button
              variants={{ style: "primary" }}
              type="submit"
              isDisabled={!amounts?.total}
              onClick={() => submitSetup()}
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
                <Button variants={{ style: "primary" }} ref={submitRef} onClick={() => submitCard()} key="submit">
                  {_(msg`lesson.content.submit`)}
                </Button>
              </Fade>
            )}
          </AnimatePresence>
        )}
        {phase === "finished" && (
          <Fade key="close">
            <Button variants={{ style: "primary" }} onClick={() => closeLesson()} autoFocus>
              {_(msg`lesson.completion.close`)}
            </Button>
          </Fade>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isTerminationRequested && <Fade className={terminationDialogOverlay} key="overlay" />}
      </AnimatePresence>
    </LessonFooterLayout>
  );
}

export function LessonFooterLayout({ children }: PropsWithChildren) {
  return <Dialog.Footer variants={{ justify: "center", class: "relative min-h-20" }}>{children}</Dialog.Footer>;
}
