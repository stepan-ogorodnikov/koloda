import type { LessonType } from "@koloda/srs";
import { NumberField } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue } from "jotai";
import type { ActionDispatch } from "react";
import { lessonAtom } from "./lesson";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

const LABELS = {
  untouched: msg`lesson.init.amount-input.untouched`,
  learn: msg`lesson.init.amount-input.learn`,
  review: msg`lesson.init.amount-input.review`,
};

type LessonInitAmountInputProps = {
  state: LessonReducerState;
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
  type: Exclude<LessonType, "total">;
};

export function LessonInitAmountInput({ state, dispatch, type }: LessonInitAmountInputProps) {
  const { _ } = useLingui();
  const { type: currentlessonType } = useAtomValue(lessonAtom) || {};

  if (!state.lessons || !state.amounts) return null;

  return (
    <NumberField
      variants={{ class: "w-32 me-4" }}
      aria-label={_(LABELS[type])}
      value={state.amounts?.[type]}
      minValue={0}
      maxValue={state.lessons[0][type]}
      onChange={(e) => {
        dispatch(["amountUpdated", { type, value: e }]);
      }}
      autoFocus={currentlessonType === type || (currentlessonType === "total" && type === "untouched")}
    >
      <NumberField.Group />
    </NumberField>
  );
}
