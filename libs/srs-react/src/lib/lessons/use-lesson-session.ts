import { queriesAtom, useHotkeysStatus } from "@koloda/core-react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { initializeLessonAtom, receiveLessonDataAtom } from "./lesson-actions";
import { filtersFromRequest } from "./lesson-reducer";
import { lessonIsOpenAtom, lessonPhaseAtom, lessonRequestAtom, lessonSetupAtom } from "./lesson-selectors";
import { useLessonUploader } from "./lesson-uploader";
import { useLessonClose } from "./use-lesson-close";

export type UseLessonSessionResult = {
  closeLesson: () => void;
};

// INVARIANT: Mount once from Lesson(). A second mount duplicates queries,
// initialize effects, uploader, and hotkey-scope effects.
export function useLessonSession(): UseLessonSessionResult {
  const { disableScope, enableScope } = useHotkeysStatus();
  const phase = useAtomValue(lessonPhaseAtom);
  const request = useAtomValue(lessonRequestAtom);
  const setup = useAtomValue(lessonSetupAtom);
  const isOpen = useAtomValue(lessonIsOpenAtom);
  const initialize = useSetAtom(initializeLessonAtom);
  const receiveLessonData = useSetAtom(receiveLessonDataAtom);
  const { closeLesson } = useLessonClose();
  const { getSettingsQuery, getTodayReviewTotalsQuery, getLessonsQuery, getLessonDataQuery } =
    useAtomValue(queriesAtom);

  const filters = request ? filtersFromRequest(request) : undefined;
  const { data: learningSettings, isFetched: hasFetchedLearningSettings } = useQuery(getSettingsQuery("learning"));
  const { data: todayReviewTotals } = useQuery({
    ...getTodayReviewTotalsQuery(),
    enabled: isOpen,
  });
  const { data: lessons } = useQuery({
    ...getLessonsQuery(filters),
    enabled: isOpen && !!filters,
  });

  const isLoadingCards = phase === "loading-cards" && !!setup;
  const { data: lessonData } = useQuery({
    ...getLessonDataQuery({
      amounts: setup?.amounts ?? { untouched: 0, learn: 0, review: 0, total: 0 },
      filters: setup?.filters ?? { deckIds: [] },
    }),
    enabled: isLoadingCards,
  });

  useEffect(() => {
    if (phase !== "preparing" || !request) return;
    if (!hasFetchedLearningSettings || !lessons || !todayReviewTotals) return;

    initialize({
      request,
      learnAheadLimit: learningSettings?.content.learnAheadLimit,
      lessons,
      todayReviewTotals,
    });
  }, [phase, request, hasFetchedLearningSettings, learningSettings, lessons, todayReviewTotals, initialize]);

  useEffect(() => {
    if (phase !== "loading-cards" || !lessonData) return;
    receiveLessonData(lessonData);
  }, [phase, lessonData, receiveLessonData]);

  useEffect(() => {
    if (isOpen) {
      disableScope("nav");
      enableScope("lesson");
    } else {
      enableScope("nav");
      disableScope("lesson");
    }

    return () => {
      enableScope("nav");
      disableScope("lesson");
    };
  }, [isOpen, disableScope, enableScope]);

  useLessonUploader();

  return { closeLesson };
}
