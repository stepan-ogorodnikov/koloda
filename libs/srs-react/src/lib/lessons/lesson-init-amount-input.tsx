import type { LessonType } from "@koloda/srs";
import { NumberField } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { updateLessonAmountAtom } from "./lesson-actions";
import { lessonAmountsAtom, lessonAvailableAtom, lessonRequestAtom } from "./lesson-selectors";

const LABELS = {
  untouched: msg`lesson.init.amount-input.untouched`,
  learn: msg`lesson.init.amount-input.learn`,
  review: msg`lesson.init.amount-input.review`,
};

export type LessonInitAmountInputProps = {
  type: Exclude<LessonType, "total">;
};

export function LessonInitAmountInput({ type }: LessonInitAmountInputProps) {
  const { _ } = useLingui();
  const request = useAtomValue(lessonRequestAtom);
  const amounts = useAtomValue(lessonAmountsAtom);
  const available = useAtomValue(lessonAvailableAtom);
  const updateAmount = useSetAtom(updateLessonAmountAtom);
  const currentLessonType = request?.type;

  if (!amounts || !available) return null;

  return (
    <NumberField
      variants={{ class: "w-32 me-4" }}
      aria-label={_(LABELS[type])}
      value={amounts[type]}
      minValue={0}
      maxValue={available[type]}
      onChange={(e) => {
        updateAmount({ type, value: e });
      }}
      autoFocus={currentLessonType === type || (currentLessonType === "total" && type === "untouched")}
    >
      <NumberField.Group />
    </NumberField>
  );
}
