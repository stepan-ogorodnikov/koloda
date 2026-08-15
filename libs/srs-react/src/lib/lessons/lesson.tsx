import { Dialog, Fade, overlayFrameContent } from "@koloda/ui";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence } from "motion/react";
import { lessonAtom, submitLessonSetupAtom } from "./lesson-actions";
import { LessonCompletion } from "./lesson-completion";
import { LessonFooter } from "./lesson-footer";
import { LessonHeader } from "./lesson-header";
import { LessonInit } from "./lesson-init";
import { LessonStudying } from "./lesson-studying";
import { LessonTermination } from "./lesson-termination";
import { lessonIsOpenAtom, lessonPhaseAtom } from "./lesson-selectors";
import { useLessonSession } from "./use-lesson-session";

export type { LessonAtomValue } from "./lesson-reducer";
export { lessonAtom };

export const lessonContent = overlayFrameContent({ class: "relative items-center justify-center overflow-auto" });

export function Lesson() {
  const { closeLesson } = useLessonSession();
  const isOpen = useAtomValue(lessonIsOpenAtom);
  const phase = useAtomValue(lessonPhaseAtom);
  const submitSetup = useSetAtom(submitLessonSetupAtom);

  const handleIsOpenChange = (value: boolean) => {
    if (!value) closeLesson();
  };

  const isSetupPhase = phase === "preparing" || phase === "configuring";
  const isSessionPhase = phase === "loading-cards" || phase === "studying";

  return (
    <Dialog.Overlay isOpen={isOpen} onOpenChange={handleIsOpenChange} isKeyboardDismissDisabled>
      <Dialog.Modal variants={{ size: "main" }} isKeyboardDismissDisabled>
        <Dialog.Body>
          <form
            className="grow flex flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              submitSetup();
            }}
          >
            <LessonHeader />
            <AnimatePresence mode="wait">
              {isSetupPhase && (
                <Fade className={lessonContent} initial={{ opacity: 1 }} key="init">
                  <LessonInit />
                </Fade>
              )}
              {isSessionPhase && (
                <Fade className={lessonContent} key="content">
                  <LessonStudying />
                  <LessonTermination />
                </Fade>
              )}
              {phase === "finished" && (
                <Fade className={lessonContent} key="finish">
                  <LessonCompletion />
                </Fade>
              )}
            </AnimatePresence>
            <LessonFooter />
          </form>
        </Dialog.Body>
      </Dialog.Modal>
    </Dialog.Overlay>
  );
}
