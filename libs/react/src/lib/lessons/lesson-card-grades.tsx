import { FSRS_GRADES } from "@koloda/srs";
import { Button, Fade } from "@koloda/ui";
import { useLingui } from "@lingui/react";
import { formatDistanceStrict } from "date-fns";
import type { ActionDispatch } from "react";
import type { RecordLogItem } from "ts-fsrs";
import type { LessonReducerAction } from "./lesson-reducer";

type LessonCardGradesProps = {
  grades: RecordLogItem[];
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonCardGrades({ grades, dispatch }: LessonCardGradesProps) {
  const { _ } = useLingui();

  return (
    <Fade className="flex flex-row gap-1 tb:gap-2" key="grades">
      {grades.map(({ card, log }, i) => (
        <div className="flex flex-col items-center gap-1 tb:w-24" key={i}>
          <div className="text-xs tb:text-sm">{formatDistanceStrict(card.due, log.review)}</div>
          <Button
            variants={{ style: "primary", class: "self-stretch max-tb:text-sm" }}
            onClick={() => dispatch(["gradeSelected", i])}
            autoFocus={i === 2}
          >
            {_(FSRS_GRADES[i])}
          </Button>
        </div>
      ))}
    </Fade>
  );
}
