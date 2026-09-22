import { queriesAtom, useHotkeysStatus } from "@koloda/core-react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import {
  failLessonDataLoadAtom,
  failLessonPrepareAtom,
  initializeLessonAtom,
  receiveLessonDataAtom,
} from "./lesson-actions";
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
  const failLessonDataLoad = useSetAtom(failLessonDataLoadAtom);
  const failLessonPrepare = useSetAtom(failLessonPrepareAtom);
  const { closeLesson } = useLessonClose();
  const { getSettingsQuery, getTodayReviewTotalsQuery, getLessonsQuery, getLessonDataQuery } =
    useAtomValue(queriesAtom);

  const filters = request ? filtersFromRequest(request) : undefined;
  const {
    data: learningSettings,
    error: learningSettingsError,
    isFetched: hasFetchedLearningSettings,
    isError: hasLearningSettingsError,
    isFetching: isFetchingLearningSettings,
  } = useQuery(getSettingsQuery("learning"));
  const {
    data: todayReviewTotals,
    error: todayReviewTotalsError,
    isError: hasTodayReviewTotalsError,
    isFetching: isFetchingTodayReviewTotals,
  } = useQuery({
    ...getTodayReviewTotalsQuery(),
    enabled: isOpen,
  });
  const {
    data: lessons,
    error: lessonsError,
    isError: hasLessonsError,
    isFetching: isFetchingLessons,
  } = useQuery({
    ...getLessonsQuery(filters),
    enabled: isOpen && !!filters,
  });

  const isLoadingCards = phase === "loading-cards" && !!setup;
  const {
    data: lessonData,
    error: lessonDataError,
    isSuccess: hasLoadedLessonData,
    isError: hasLessonDataError,
    isFetching: isFetchingLessonData,
  } = useQuery({
    ...getLessonDataQuery({
      amounts: setup?.amounts ?? { untouched: 0, learn: 0, review: 0, total: 0 },
      filters: setup?.filters ?? { deckIds: [] },
    }),
    enabled: isLoadingCards,
  });

  useEffect(() => {
    if (phase !== "preparing") return;
    // WHY: a rejected prepare query never produces data, so initialize waits
    // forever and the dialog stays blank. Wait out retries (isFetching), then
    // terminalize the same way a failed card load does.
    const prepareError = firstSettledQueryError([
      { isFetching: isFetchingLearningSettings, isError: hasLearningSettingsError, error: learningSettingsError },
      { isFetching: isFetchingLessons, isError: hasLessonsError, error: lessonsError },
      { isFetching: isFetchingTodayReviewTotals, isError: hasTodayReviewTotalsError, error: todayReviewTotalsError },
    ]);
    if (!prepareError) return;
    failLessonPrepare(prepareError);
  }, [
    phase,
    isFetchingLearningSettings,
    hasLearningSettingsError,
    learningSettingsError,
    isFetchingLessons,
    hasLessonsError,
    lessonsError,
    isFetchingTodayReviewTotals,
    hasTodayReviewTotalsError,
    todayReviewTotalsError,
    failLessonPrepare,
  ]);

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
    if (phase !== "loading-cards" || !hasLoadedLessonData) return;
    receiveLessonData(lessonData ?? null);
  }, [phase, lessonData, hasLoadedLessonData, receiveLessonData]);

  useEffect(() => {
    if (phase !== "loading-cards" || !hasLessonDataError || isFetchingLessonData || !lessonDataError) return;
    failLessonDataLoad(lessonDataError);
  }, [phase, hasLessonDataError, isFetchingLessonData, lessonDataError, failLessonDataLoad]);

  useEffect(() => {
    if (isOpen) {
      disableScope("navigation");
      enableScope("grades");
    } else {
      enableScope("navigation");
      disableScope("grades");
    }

    return () => {
      enableScope("navigation");
      disableScope("grades");
    };
  }, [isOpen, disableScope, enableScope]);

  useLessonUploader();

  return { closeLesson };
}

type SettledQuery = {
  isFetching: boolean;
  isError: boolean;
  error: unknown;
};

function firstSettledQueryError(queries: SettledQuery[]): unknown | null {
  for (const query of queries) {
    if (!query.isFetching && query.isError && query.error) return query.error;
  }
  return null;
}
