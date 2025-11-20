import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ActionDispatch } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

type LessonCompletionProps = {
  state: LessonReducerState;
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonCompletion({ dispatch }: LessonCompletionProps) {
  const { _ } = useLingui();

  useHotkeys("esc", () => dispatch(["isOpenUpdated", false]));

  return (
    <>
      <Dialog.Content variants={{ class: "items-center justify-center" }}>
        <div className="text-xl font-semibold">
          {_(msg`lesson.completion.message`)}
        </div>
      </Dialog.Content>
      <Dialog.Footer>
        <Button
          variants={{ style: "primary" }}
          onClick={() => dispatch(["isOpenUpdated", false])}
        >
          {_(msg`lesson.completion.close`)}
        </Button>
      </Dialog.Footer>
    </>
  );
}
