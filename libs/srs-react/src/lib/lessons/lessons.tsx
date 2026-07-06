import { queriesAtom, queryKeys } from "@koloda/core-react";
import { QueryState } from "@koloda/ui";
import { getCSSVar } from "@koloda/ui";
import { useMediaQuery } from "@react-hook/media-query";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Lesson as CurrentLesson } from "./lesson";
import { LessonsList } from "./lessons-list";
import { LessonsTable } from "./lessons-table";

export function Lessons() {
  const isMobile = useMediaQuery(`(width < ${getCSSVar("--breakpoint-wd")})`);
  const { getLessonsQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: queryKeys.lessons.all(), ...getLessonsQuery() });

  return (
    <div className="w-full wd:max-w-180 mx-auto p-4">
      <CurrentLesson />
      <QueryState query={query}>
        {(data) => (isMobile ? <LessonsList data={data} /> : <LessonsTable data={data} />)}
      </QueryState>
    </div>
  );
}
