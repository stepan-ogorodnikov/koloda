import { queriesAtom, queryKeys, useHotkeysStatus } from "@koloda/core-react";
import type { LessonFilters } from "@koloda/srs";
import { Dialog, Fade, overlayFrameContent } from "@koloda/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
import { useEffect, useReducer, useRef } from "react";
import { lessonAtom } from "./lesson-actions";
import { LessonCompletion } from "./lesson-completion";
import { LessonFooter } from "./lesson-footer";
import { LessonHeader } from "./lesson-header";
import { LessonInit } from "./lesson-init";
import type { LessonAtomValue } from "./lesson-reducer";
import { lessonReducer, lessonReducerDefault } from "./lesson-reducer";
import { LessonStudying } from "./lesson-studying";
import { LessonTermination } from "./lesson-termination";

export type { LessonAtomValue } from "./lesson-reducer";
export { lessonAtom };

export const lessonContent = overlayFrameContent({ class: "relative items-center justify-center overflow-auto" });

function filtersFromRequest(request: LessonAtomValue): LessonFilters {
  return { deckIds: request.deckId ? [request.deckId] : [] };
}

export function Lesson() {
  const queryClient = useQueryClient();
  const { disableScope, enableScope } = useHotkeysStatus();
  // INVARIANT: Local reducer is the UI write path until Phase 4. Do not replace
  // useReducer with the Jotai store here. Clearing lessonAtom on closed runs
  // close on the store (full reset), not merely dropping a launch request.
  const [state, dispatch] = useReducer(lessonReducer, lessonReducerDefault);
  const [atomValue, setAtomValue] = useAtom(lessonAtom);
  const { getSettingsQuery, getTodayReviewTotalsQuery, getLessonsQuery } = useAtomValue(queriesAtom);
  const { data: learningSettings, isFetched: hasFetchedLearningSettings } = useQuery(getSettingsQuery("learning"));
  const isOpen = state.phase !== "closed";
  const lastFiltersRef = useRef<LessonFilters | undefined>(undefined);
  const lessonFilters = state.request ? filtersFromRequest(state.request) : undefined;
  const { data: todayReviewTotals } = useQuery({
    ...getTodayReviewTotalsQuery(),
    enabled: isOpen,
  });
  const { data: lessons } = useQuery({
    ...getLessonsQuery(lessonFilters),
    enabled: isOpen && !!lessonFilters,
  });

  // WHY: capture filters on render while request is still set. Close nulls
  // request/setup, so the closed effect cannot read them.
  if (lessonFilters) lastFiltersRef.current = lessonFilters;

  useEffect(() => {
    if (state.phase === "closed") setAtomValue(null);
  }, [state.phase, setAtomValue]);

  useEffect(() => {
    // INVARIANT: depend only on phase. Putting request/setup filters in deps
    // would drop the deck-scoped lessons.all(filters) invalidation after close.
    if (state.phase === "closed") {
      queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all(lastFiltersRef.current) });
      queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.lessons.todayReviewTotals() });
    }
  }, [state.phase, queryClient]);

  useEffect(() => {
    (isOpen ? disableScope : enableScope)("nav");
    (isOpen ? enableScope : disableScope)("lesson");
  }, [isOpen, disableScope, enableScope]);

  useEffect(() => {
    // WHY: depend only on atomValue. After close the atom is still set until the
    // following effect; including phase would re-open the just-closed lesson.
    if (atomValue) dispatch(["open", atomValue]);
  }, [atomValue]);

  useEffect(() => {
    if (state.phase !== "preparing" || !state.request) return;
    if (!hasFetchedLearningSettings || !lessons || !todayReviewTotals) return;

    dispatch([
      "initialize",
      {
        request: state.request,
        learnAheadLimit: learningSettings?.content.learnAheadLimit,
        lessons,
        todayReviewTotals,
      },
    ]);
  }, [state.phase, state.request, hasFetchedLearningSettings, learningSettings, lessons, todayReviewTotals]);

  const handleIsOpenChange = (value: boolean) => {
    if (!value) dispatch(["close"]);
  };

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
