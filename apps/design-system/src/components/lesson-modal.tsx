import { FSRS_GRADES } from "@koloda/srs";
import { LessonHeaderLayout, LessonProgressAmountsView, LessonProgressDotsView, lessonAtom } from "@koloda/srs-react";
import type { LessonProgressDot } from "@koloda/srs-react";
import { Button, Dialog } from "@koloda/ui";
import { useLingui } from "@lingui/react";
import { useAtom } from "jotai";

const DOT_TYPES = ["untouched", "learn", "review"] as const;

// WHY: every type with every icon, in lesson order: done, current, pending.
// A real lesson has one current dot; this row marks one per type so play shows in each color.
// The row centers on the first play dot, as on the current card, so the other two sit ahead of it.
const DOTS: LessonProgressDot[] = [
  ...DOT_TYPES.map((type) => ({ type, status: "success" as const, isCurrent: false })),
  ...DOT_TYPES.map((type) => ({ type, status: "error" as const, isCurrent: false })),
  ...DOT_TYPES.map((type) => ({ type, isCurrent: true })),
  ...DOT_TYPES.map((type) => ({ type, isCurrent: false })),
];

const CURRENT_INDEX = DOTS.findIndex(({ isCurrent }) => isCurrent);

const DONE = { untouched: 2, learn: 2, review: 2, total: 6 };
const PENDING = { untouched: 2, learn: 2, review: 2, total: 6 };

const GRADE_INTERVALS = ["1 minute", "6 minutes", "10 minutes", "8 days"];

// WHY: mirrors `LessonFooterLayout` and `LessonCardGrades` in `@koloda/srs-react`, which are not exported.
// Keep the classes in step with those files.
function LessonGrades() {
  const { _ } = useLingui();

  return (
    <Dialog.Footer variants={{ justify: "center", class: "relative min-h-20" }}>
      <div className="flex flex-row gap-1 wd:gap-2">
        {FSRS_GRADES.map((grade, i) => (
          <div className="flex flex-col items-center gap-1 wd:w-24" key={i}>
            <div className="text-xs wd:text-sm">{GRADE_INTERVALS[i]}</div>
            <Button variants={{ style: "primary", class: "self-stretch max-wd:text-sm" }} autoFocus={i === 2}>
              {_(grade)}
            </Button>
          </div>
        ))}
      </div>
    </Dialog.Footer>
  );
}

export function LessonModal() {
  const [request, setRequest] = useAtom(lessonAtom);

  return (
    <Dialog.Overlay
      isOpen={request != null}
      onOpenChange={(isOpen) => {
        if (!isOpen) setRequest(null);
      }}
    >
      <Dialog.Modal variants={{ size: "main" }}>
        <Dialog.Body aria-label="Lesson">
          <LessonHeaderLayout>
            <Dialog.Close variants={{ class: "absolute top-0 right-0" }} slot="close" />
            <LessonProgressAmountsView done={DONE} pending={PENDING} />
            <LessonProgressDotsView dots={DOTS} index={CURRENT_INDEX} />
          </LessonHeaderLayout>
          <Dialog.Content />
          <LessonGrades />
        </Dialog.Body>
      </Dialog.Modal>
    </Dialog.Overlay>
  );
}
