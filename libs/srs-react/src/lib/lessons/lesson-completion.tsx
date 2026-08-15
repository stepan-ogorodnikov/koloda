import { useAppHotkey } from "@koloda/core-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useLessonClose } from "./use-lesson-close";

export function LessonCompletion() {
  const { _ } = useLingui();
  const { closeLesson } = useLessonClose();

  useAppHotkey(["Escape"], () => closeLesson(), "lesson");

  return <div className="text-xl font-semibold">{_(msg`lesson.completion.message`)}</div>;
}
