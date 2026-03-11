import { Lesson as CurrentLesson, QueryState } from "@koloda/react";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import { getCSSVar } from "@koloda/ui";
import { useMediaQuery } from "@react-hook/media-query";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { LessonsList } from "./lessons-list";
import { LessonsTable } from "./lessons-table";

export function Lessons() {
  const isMobile = useMediaQuery(`(width < ${getCSSVar("--breakpoint-tb")})`);
  const { getLessonsQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: queryKeys.lessons.all(), ...getLessonsQuery() });

  return (
    <div className="w-full max-tb:order-2 tb:max-w-180 tb:overflow-auto">
      <CurrentLesson />
      <QueryState query={query}>
        {(data) => (isMobile ? <LessonsList data={data} /> : <LessonsTable data={data} />)}
      </QueryState>
    </div>
  );
}
