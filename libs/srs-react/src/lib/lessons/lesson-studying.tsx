import { queriesAtom, useAppHotkey, useHotkeysSettings } from "@koloda/core-react";
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
  const { grades, ui } = useHotkeysSettings();
  const { data } = useQuery(getLessonDataQuery({ amounts: state.setup!.amounts, filters: state.setup!.filters }));

  useAppHotkey(grades.again, () => dispatch(["gradeSelected", 0]), "lesson", { eventType: "keyup" });
  useAppHotkey(grades.hard, () => dispatch(["gradeSelected", 1]), "lesson", { eventType: "keyup" });
  useAppHotkey(grades.normal, () => dispatch(["gradeSelected", 2]), "lesson", { eventType: "keyup" });
  useAppHotkey(grades.easy, () => dispatch(["gradeSelected", 3]), "lesson", { eventType: "keyup" });
  useAppHotkey(["Enter", "Space"], () => dispatch(["cardSubmitted"]), "lesson", { conflictBehavior: "allow" });
  useAppHotkey(["Escape"], () => dispatch(["terminationRequested", true]), "lesson", { ignoreInputs: false });
  useAppHotkey(
    ui.submit,
    () => {
      if (["TEXTAREA", "INPUT"].includes(document.activeElement?.tagName || "")) dispatch(["cardSubmitted"]);
    },
    "lesson",
    { ignoreInputs: false, conflictBehavior: "allow" },
  );

  useEffect(() => {
    if (data) dispatch(["lessonDataReceived", data]);
  }, [dispatch, data]);

  const content = state.session?.content;
  if (!content) return null;

  return (
    <AnimatePresence mode="wait">
      <Fade className={lessonStudying} key={content.index}>
        {content.template.layout.map((item, i) => (
          <LessonCardField
            params={item}
            content={content}
            onFormChange={(key, value) => dispatch(["cardFormUpdated", { key, value }])}
            onSubmit={() => dispatch(["cardSubmitted"])}
            key={i}
          />
        ))}
      </Fade>
    </AnimatePresence>
  );
}
