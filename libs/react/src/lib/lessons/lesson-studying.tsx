import { queriesAtom, queryKeys, useAppHotkey, useHotkeysSettings } from "@koloda/react-base";
import { Fade } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
import { useEffect } from "react";
import type { ActionDispatch } from "react";
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
    queryKey: queryKeys.lessons.data({ amounts: state.amounts!, filters: state.filters! }),
    ...getLessonDataQuery({ amounts: state.amounts!, filters: state.filters! }),
  });

  useAppHotkey(grades.again, () => dispatch(["gradeSelected", 0]), "lesson", { eventType: "keyup" });
  useAppHotkey(grades.hard, () => dispatch(["gradeSelected", 1]), "lesson", { eventType: "keyup" });
  useAppHotkey(grades.normal, () => dispatch(["gradeSelected", 2]), "lesson", { eventType: "keyup" });
  useAppHotkey(grades.easy, () => dispatch(["gradeSelected", 3]), "lesson", { eventType: "keyup" });
  useAppHotkey(["Enter", "Space"], () => dispatch(["cardSubmitted"]), "lesson", { conflictBehavior: "allow" });
  useAppHotkey(["Escape"], () => dispatch(["terminationRequested", true]), "lesson", { ignoreInputs: false });

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
