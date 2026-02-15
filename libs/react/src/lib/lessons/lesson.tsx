import { lessonsQueryKeys, queriesAtom, settingsQueryKeys } from "@koloda/react";
import type { Deck, LessonType } from "@koloda/srs";
import { Dialog, Fade, overlayFrameContent, useHotkeysStatus } from "@koloda/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

const lessonContent = overlayFrameContent({ class: "relative items-center justify-center overflow-auto" });

export function Lesson() {
  const queryClient = useQueryClient();
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
    if (!isOpen) {
      queryClient.invalidateQueries({ queryKey: lessonsQueryKeys.all(state.filters) });
      queryClient.invalidateQueries({ queryKey: lessonsQueryKeys.all() });
      queryClient.invalidateQueries({ queryKey: lessonsQueryKeys.todayReviewTotals() });
    }
  }, [isOpen, queryClient, state.filters]);

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

  const handleIsOpenChange = (value: boolean) => {
    dispatch(["isOpenUpdated", value]);
  };

  return (
    <Dialog.Overlay
      isOpen={state.meta.isOpen}
      onOpenChange={handleIsOpenChange}
      isKeyboardDismissDisabled
    >
      <Dialog.Modal variants={{ size: "main" }} isKeyboardDismissDisabled>
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
