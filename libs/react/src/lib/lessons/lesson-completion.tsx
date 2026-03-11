import { useAppHotkey } from "@koloda/react-base";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ActionDispatch } from "react";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

type LessonCompletionProps = {
  state: LessonReducerState;
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonCompletion({ dispatch }: LessonCompletionProps) {
  const { _ } = useLingui();

  useAppHotkey(["Escape"], () => dispatch(["isOpenUpdated", false]), "lesson");

  return (
    <div className="text-xl font-semibold">
      {_(msg`lesson.completion.message`)}
    </div>
  );
}
