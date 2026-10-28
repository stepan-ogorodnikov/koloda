import { queriesAtom } from "@koloda/core-react";
import { QueryState } from "@koloda/ui";
import { getCSSVar } from "@koloda/ui";
import { useMediaQuery } from "@react-hook/media-query";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { Lesson as CurrentLesson } from "./lesson";
import { LessonsList } from "./lessons-list";
import { LessonsTable } from "./lessons-table";

type LessonsProps = {
  // WHY: the design system app swaps in its own lesson modal; the product passes nothing.
  lesson?: ReactNode;
};

export function Lessons({ lesson = <CurrentLesson /> }: LessonsProps) {
  const isMobile = useMediaQuery(`(width < ${getCSSVar("--breakpoint-wd")})`);
  const { getLessonsQuery } = useAtomValue(queriesAtom);
  const query = useQuery({
    ...getLessonsQuery(),
    // WHY: the counts are cards ready now, so they change with the clock, which no mutation invalidates.
    refetchInterval: 60_000,
  });

  return (
    <div className="w-full wd:max-w-180 mx-auto p-4">
      {lesson}
      <QueryState query={query}>
        {(data) => (isMobile ? <LessonsList data={data} /> : <LessonsTable data={data} />)}
      </QueryState>
    </div>
  );
}
