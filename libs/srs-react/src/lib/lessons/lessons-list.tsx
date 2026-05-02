import type { Lesson, LessonType } from "@koloda/srs";
import { LESSON_TYPE_LABELS } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { LessonBadge } from "./lesson-badge";

type LessonsTableProps = { data: Lesson[] };

export function LessonsList({ data }: LessonsTableProps) {
  const { _ } = useLingui();

  return (
    <div className="my-2">
      <div className="sticky top-0 flex flex-row p-2 border-b-2 border-main bg-level-1">
        {(["untouched", "learn", "review", "total"] as const).map((type) => (
          <div className="w-1/4 text-center fg-table-head font-semibold" key={type}>{_(LESSON_TYPE_LABELS[type])}</div>
        ))}
      </div>
      {data.map((deck, i) => (
        <div className="flex flex-col pt-3 border-b-2 border-main" key={i}>
          {deck.title
            ? <div className="px-2 text-center break-all">{deck.title}</div>
            : <div className="px-2 text-center fg-level-4 font-semibold">{_(msg`lessons.table.columns.title.all`)}
            </div>}
          <div className="flex">
            {(["untouched", "learn", "review", "total"] as const).map((type) => (
              <LessonBadge type={type as LessonType} value={`${deck[type]}`} deckId={deck.id} key={type} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
