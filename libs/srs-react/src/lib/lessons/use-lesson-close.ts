import { queryKeys } from "@koloda/core-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSetAtom, useStore } from "jotai";
import { useCallback } from "react";
import { closeLessonStateAtom } from "./lesson-actions";
import { filtersFromRequest } from "./lesson-reducer";
import { lessonRequestAtom, lessonSetupAtom } from "./lesson-selectors";

export type UseLessonCloseResult = {
  closeLesson: () => void;
};

// INVARIANT: Full close path (capture filters, reset state, invalidate queries).
// Do not call closeLessonStateAtom from UI. Do not remount useLessonSession for close.
export function useLessonClose(): UseLessonCloseResult {
  const store = useStore();
  const queryClient = useQueryClient();
  const closeLessonState = useSetAtom(closeLessonStateAtom);

  const closeLesson = useCallback(() => {
    // WHY: close nulls request/setup; capture filters before reset so deck-scoped
    // lessons.all(filters) still invalidates.
    const activeRequest = store.get(lessonRequestAtom);
    const activeSetup = store.get(lessonSetupAtom);
    const activeFilters = activeSetup?.filters ?? (activeRequest ? filtersFromRequest(activeRequest) : undefined);
    closeLessonState();
    queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all(activeFilters) });
    queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.lessons.todayReviewTotals() });
  }, [closeLessonState, queryClient, store]);

  return { closeLesson };
}
