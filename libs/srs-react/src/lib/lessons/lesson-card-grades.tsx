import { FSRS_GRADES } from "@koloda/srs";
import { Button } from "@koloda/ui";
import { useLingui } from "@lingui/react";
import { formatDistanceStrict } from "date-fns";
import { useSetAtom } from "jotai";
import type { RecordLogItem } from "ts-fsrs";
import { selectLessonGradeAtom } from "./lesson-actions";

export type LessonCardGradesProps = {
  grades: RecordLogItem[];
};

export function LessonCardGrades({ grades }: LessonCardGradesProps) {
  const { _ } = useLingui();
  const selectGrade = useSetAtom(selectLessonGradeAtom);

  return (
    <div className="flex flex-row gap-1 wd:gap-2">
      {grades.map(({ card, log }, i) => (
        <div className="flex flex-col items-center gap-1 wd:w-24" key={i}>
          <div className="text-xs wd:text-sm">{formatDistanceStrict(card.due, log.review)}</div>
          <Button
            variants={{ style: "primary", class: "self-stretch max-wd:text-sm" }}
            onClick={() => selectGrade(i)}
            autoFocus={i === 2}
          >
            {_(FSRS_GRADES[i])}
          </Button>
        </div>
      ))}
    </div>
  );
}
