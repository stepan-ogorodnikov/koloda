import { lessonsQueryKeys, queriesAtom, useHotkeysSettings } from "@koloda/react";
import { Fade } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
import { useEffect } from "react";
import type { ActionDispatch } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { LessonCardField } from "./lesson-card-field";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

export const lessonStudying = "self-stretch flex flex-col items-center gap-6";

type LessonStudyingProps = {
  state: LessonReducerState;
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonStudying({ state, dispatch }: LessonStudyingProps) {
  const { getLessonDataQuery } = useAtomValue(queriesAtom);
  const { grades } = useHotkeysSettings();
  const { data } = useQuery({
    queryKey: lessonsQueryKeys.data({ amounts: state.amounts!, filters: state.filters! }),
    ...getLessonDataQuery({ amounts: state.amounts!, filters: state.filters! }),
  });

  useHotkeys(grades.again, () => dispatch(["gradeSelected", 0]), { keyup: true });
  useHotkeys(grades.hard, () => dispatch(["gradeSelected", 1]), { keyup: true });
  useHotkeys(grades.normal, () => dispatch(["gradeSelected", 2]), { keyup: true });
  useHotkeys(grades.easy, () => dispatch(["gradeSelected", 3]), { keyup: true });
  useHotkeys("enter, space", () => dispatch(["cardSubmitted"]));
  useHotkeys("esc", () => dispatch(["terminationRequested", true]), { enableOnFormTags: true });

  useEffect(() => {
    if (data) dispatch(["lessonDataReceived", data]);
  }, [dispatch, data]);

  if (!state.content) return null;

  return (
    <AnimatePresence mode="wait">
      <Fade className={lessonStudying} key={state.content.index}>
        {state.content.template.layout.map((item, i) => (
          <LessonCardField
            params={item}
            content={state.content!}
            dispatch={dispatch}
            key={i}
          />
        ))}
      </Fade>
    </AnimatePresence>
  );
}
