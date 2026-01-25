import { lessonsQueryKeys, queriesAtom } from "@koloda/react";
import { getCSSVar } from "@koloda/ui";
import { useMediaQuery } from "@react-hook/media-query";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import type { ActionDispatch } from "react";
import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { LessonInitList } from "./lesson-init-list";
import { LessonInitTable } from "./lesson-init-table";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

type LessonInitProps = {
  state: LessonReducerState;
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonInit({ state, dispatch }: LessonInitProps) {
  const isMobile = useMediaQuery(`(width < ${getCSSVar("--breakpoint-tb")})`);
  const { getTodayReviewTotalsQuery, getLessonsQuery } = useAtomValue(queriesAtom);
  const { data: learnedToday } = useQuery({
    queryKey: lessonsQueryKeys.todayReviewTotals(),
    ...getTodayReviewTotalsQuery(),
  });
  const { data: lessons } = useQuery({
    queryKey: lessonsQueryKeys.all(state.filters),
    ...getLessonsQuery(state.filters!),
  });

  useHotkeys("esc", () => dispatch(["isOpenUpdated", false]), { enableOnFormTags: true });

  useEffect(() => {
    if (learnedToday) dispatch(["todayReviewTotalsReceived", learnedToday]);
  }, [dispatch, learnedToday]);

  useEffect(() => {
    if (lessons) dispatch(["lessonsReceived", lessons]);
  }, [dispatch, lessons]);

  if (!state.todayReviewTotals || !state.lessons || !state.amounts) return null;

  return (
    isMobile
      ? <LessonInitList state={state} dispatch={dispatch} />
      : <LessonInitTable state={state} dispatch={dispatch} />
  );
}
