import { lessonsQueryKeys, queriesAtom } from "@koloda/react";
import { Button, Dialog, getCSSVar } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
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
  const { _ } = useLingui();
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
    <>
      <form
        className="grow flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dispatch(["lessonStarted"]);
        }}
      >
        <Dialog.Content variants={{ class: "tb:items-center justify-center overflow-auto" }}>
          {isMobile
            ? <LessonInitList state={state} dispatch={dispatch} />
            : <LessonInitTable state={state} dispatch={dispatch} />}
        </Dialog.Content>
        <Dialog.Footer>
          <Button
            variants={{ style: "primary" }}
            type="submit"
            isDisabled={!state.amounts.total}
            onClick={() => dispatch(["lessonStarted"])}
          >
            {_(msg`lesson.init.submit`)}
          </Button>
        </Dialog.Footer>
      </form>
    </>
  );
}
