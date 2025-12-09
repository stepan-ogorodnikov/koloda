import { Lesson as CurrentLesson, queriesAtom } from "@koloda/react";
import { useMediaQuery } from "@react-hook/media-query";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { LessonsList } from "./lessons-list";
import { LessonsTable } from "./lessons-table";

export function Lessons() {
  const isMobile = useMediaQuery("(width < 48rem)");
  const { getLessonsQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: ["lessons"], ...getLessonsQuery({}) });

  if (!data) return null;

  return (
    <div className="max-tb:order-2 tb:max-w-180 tb:overflow-auto">
      <CurrentLesson />
      {isMobile ? <LessonsList data={data} /> : <LessonsTable data={data} />}
    </div>
  );
}
