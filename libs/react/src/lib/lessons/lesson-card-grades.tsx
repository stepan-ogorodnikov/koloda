import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { formatDistanceStrict } from "date-fns";
import type { ActionDispatch } from "react";
import type { RecordLogItem } from "ts-fsrs";
import type { LessonReducerAction } from "./lesson-reducer";

const GRADES = [
  msg`fsrs.grades.again`,
  msg`fsrs.grades.hard`,
  msg`fsrs.grades.good`,
  msg`fsrs.grades.easy`,
];

type LessonCardGradesProps = {
  grades: RecordLogItem[];
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonCardGrades({ grades, dispatch }: LessonCardGradesProps) {
  const { _ } = useLingui();

  return (
    <div className="flex flex-row gap-1 tb:gap-2">
      {grades.map(({ card, log }, i) => (
        <div className="flex flex-col items-center gap-1 tb:w-24" key={i}>
          <div className="text-xs tb:text-sm">{formatDistanceStrict(card.due, log.due)}</div>
          <Button
            variants={{ style: "primary", class: "self-stretch max-tb:text-sm" }}
            onClick={() => {
              dispatch(["gradeSelected", i]);
            }}
            autoFocus={i === 2}
          >
            {_(GRADES[i])}
          </Button>
        </div>
      ))}
    </div>
  );
}
