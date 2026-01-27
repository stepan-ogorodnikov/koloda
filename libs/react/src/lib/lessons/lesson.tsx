import { queriesAtom, settingsQueryKeys } from "@koloda/react";
import type { Deck, LessonType } from "@koloda/srs";
import { Dialog, Fade, overlayFrameContent, useHotkeysStatus } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
import { useEffect, useReducer } from "react";
import { LessonCompletion } from "./lesson-completion";
import { LessonFooter } from "./lesson-footer";
import { LessonHeader } from "./lesson-header";
import { LessonInit } from "./lesson-init";
import { lessonReducer, lessonReducerDefault } from "./lesson-reducer";
import { LessonStudying } from "./lesson-studying";
import { LessonTermination } from "./lesson-termination";

export type LessonAtomValue = {
  type: LessonType;
  deckId?: Deck["id"] | null;
};

export const lessonAtom = atom<LessonAtomValue | null>(null);

const lessonModal = [
  "max-tb:w-full tb:min-w-144",
  "max-tb:h-full min-h-[min(36rem,100%)] max-h-screen",
  "overflow-hidden",
].join(" ");

const lessonContent = overlayFrameContent({ class: "relative items-center justify-center overflow-auto" });

export function Lesson() {
  const { disableScope, enableScope } = useHotkeysStatus();
  const [state, dispatch] = useReducer(lessonReducer, lessonReducerDefault);
  const [atomValue, setAtomValue] = useAtom(lessonAtom);
  const { getSettingsQuery } = useAtomValue(queriesAtom);
  const { data: learningSettings } = useQuery({
    queryKey: settingsQueryKeys.detail("learning"),
    ...getSettingsQuery("learning"),
  });
  const { isOpen, isSubmitted, isFinished } = state.meta;

  useEffect(() => {
    if (!isOpen) setAtomValue(null);
  }, [isOpen, setAtomValue]);

  useEffect(() => {
    (isOpen ? disableScope : enableScope)("nav");
  }, [isOpen, disableScope, enableScope]);

  useEffect(() => {
    if (atomValue) dispatch(["paramsSet", atomValue]);
  }, [atomValue]);

  useEffect(() => {
    if (learningSettings?.content.learnAheadLimit) {
      dispatch(["learnAheadLimitReceived", learningSettings.content.learnAheadLimit]);
    }
  }, [learningSettings]);

  return (
    <Dialog.Overlay
      isOpen={state.meta.isOpen}
      onOpenChange={(value) => dispatch(["isOpenUpdated", value])}
      isKeyboardDismissDisabled
    >
      <Dialog.Modal variants={{ class: lessonModal }} isKeyboardDismissDisabled>
        <Dialog.Body>
          <form
            className="grow flex flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dispatch(["lessonSubmitted"]);
            }}
          >
            <LessonHeader state={state} dispatch={dispatch} />
            <AnimatePresence mode="wait">
              {!isSubmitted && (
                <Fade className={lessonContent} initial={{ opacity: 1 }} key="init">
                  <LessonInit state={state} dispatch={dispatch} />
                </Fade>
              )}
              {isSubmitted && !isFinished && (
                <Fade className={lessonContent} key="content">
                  <LessonStudying state={state} dispatch={dispatch} />
                  <LessonTermination state={state} dispatch={dispatch} />
                </Fade>
              )}
              {isFinished && (
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
