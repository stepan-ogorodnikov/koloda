import { Dialog, Fade, overlayFrameContent } from "@koloda/ui";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence } from "motion/react";
import { useCallback } from "react";
import { lessonAtom } from "./lesson-actions";
import { LessonCompletion } from "./lesson-completion";
import { LessonFooter } from "./lesson-footer";
import { LessonHeader } from "./lesson-header";
import { LessonInit } from "./lesson-init";
import type { LessonReducerAction } from "./lesson-reducer";
import { LessonStudying } from "./lesson-studying";
import { LessonTermination } from "./lesson-termination";
import { lessonStateAtom } from "./lesson-store";
import { useLessonSession } from "./use-lesson-session";

export type { LessonAtomValue } from "./lesson-reducer";
export { lessonAtom };

export const lessonContent = overlayFrameContent({ class: "relative items-center justify-center overflow-auto" });

export function Lesson() {
  const { closeLesson } = useLessonSession();
  // INVARIANT: The store is the only write path. Children still receive
  // state/dispatch until Phase 4 UI migration.
  const state = useAtomValue(lessonStateAtom);
  const setLessonState = useSetAtom(lessonStateAtom);
  // WHY: Views still dispatch ["close"]; intercept here so invalidation runs
  // without migrating every child this commit.
  const dispatch = useCallback(
    (action: LessonReducerAction) => {
      if (action[0] === "close") {
        closeLesson();
        return;
      }
      setLessonState(action);
    },
    [closeLesson, setLessonState],
  );

  const handleIsOpenChange = (value: boolean) => {
    if (!value) closeLesson();
  };

  const isOpen = state.phase !== "closed";
  const isSetupPhase = state.phase === "preparing" || state.phase === "configuring";
  const isSessionPhase = state.phase === "loading-cards" || state.phase === "studying";

  return (
    <Dialog.Overlay isOpen={isOpen} onOpenChange={handleIsOpenChange} isKeyboardDismissDisabled>
      <Dialog.Modal variants={{ size: "main" }} isKeyboardDismissDisabled>
        <Dialog.Body>
          <form
            className="grow flex flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dispatch(["setupSubmitted"]);
            }}
          >
            <LessonHeader state={state} dispatch={dispatch} />
            <AnimatePresence mode="wait">
              {isSetupPhase && (
                <Fade className={lessonContent} initial={{ opacity: 1 }} key="init">
                  <LessonInit state={state} dispatch={dispatch} />
                </Fade>
              )}
              {isSessionPhase && (
                <Fade className={lessonContent} key="content">
                  <LessonStudying state={state} dispatch={dispatch} />
                  <LessonTermination state={state} dispatch={dispatch} />
                </Fade>
              )}
              {state.phase === "finished" && (
                <Fade className={lessonContent} key="finish">
                  <LessonCompletion state={state} dispatch={dispatch} />
                </Fade>
              )}
            </AnimatePresence>
            <LessonFooter state={state} dispatch={dispatch} />
          </form>
        </Dialog.Body>
      </Dialog.Modal>
    </Dialog.Overlay>
  );
}
