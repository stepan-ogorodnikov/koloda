import { ERROR_MESSAGES, formatAppError } from "@koloda/app";
import { useAppHotkey } from "@koloda/core-react";
import { ErrorMessage } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue } from "jotai";
import { lessonLoadErrorAtom } from "./lesson-selectors";
import { useLessonClose } from "./use-lesson-close";

export function LessonCompletion() {
  const { _ } = useLingui();
  const loadError = useAtomValue(lessonLoadErrorAtom);
  const { closeLesson } = useLessonClose();

  useAppHotkey(["Escape"], () => closeLesson(), "grades");

  if (loadError != null) {
    return <ErrorMessage {...formatAppError(loadError, _, ERROR_MESSAGES["db.get"])} />;
  }

  return <div className="text-xl font-semibold">{_(msg`lesson.completion.message`)}</div>;
}
