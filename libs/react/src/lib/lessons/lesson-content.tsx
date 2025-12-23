import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import type { ActionDispatch } from "react";
import { FocusScope } from "react-aria";
import { useHotkeys } from "react-hotkeys-hook";
import { lessonsQueryKeys, queriesAtom } from "@koloda/react";
import { LessonCardContentField } from "./lesson-card-content-field";
import { LessonCardGrades } from "./lesson-card-grades";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

const terminationDialogOverlay = [
  "absolute inset-0 flex flex-col items-center justify-center gap-4",
  "bg-level-1/80 backdrop-blur-xs",
].join(" ");

type LessonContentProps = {
  state: LessonReducerState;
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonContent({ state, dispatch }: LessonContentProps) {
  const { _ } = useLingui();
  const { getLessonDataQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({
    queryKey: lessonsQueryKeys.data({ amounts: state.amounts!, filters: state.filters! }),
    ...getLessonDataQuery({ amounts: state.amounts!, filters: state.filters! }),
  });
  const submitRef = useRef<HTMLButtonElement>(null);

  useHotkeys("1", () => dispatch(["gradeSelected", 0]));
  useHotkeys("2", () => dispatch(["gradeSelected", 1]));
  useHotkeys("3, enter, space", () => dispatch(["gradeSelected", 2]));
  useHotkeys("4", () => dispatch(["gradeSelected", 3]));
  useHotkeys("enter, space", () => dispatch(["cardSubmitted"]));
  useHotkeys("esc", () => dispatch(["terminationRequested", true]));

  useEffect(() => {
    if (data) dispatch(["lessonDataReceived", data]);
  }, [dispatch, data]);

  useEffect(() => {
    if (state?.content?.form?.isSubmitted === false) submitRef?.current?.focus();
  }, [state?.content?.form?.isSubmitted]);

  if (!state.content) return null;

  return (
    <>
      <Dialog.Content variants={{ class: "relative items-center justify-center gap-4" }}>
        {state.meta.isTerminationRequested && (
          <div className={terminationDialogOverlay}>
            <FocusScope contain autoFocus>
              <Button
                variants={{ style: "ghost" }}
                ref={submitRef}
                onClick={() => {
                  dispatch(["terminationRequested", false]);
                }}
              >
                {_(msg`lesson.content.termination.refuse`)}
              </Button>
              <Button
                variants={{ style: "primary" }}
                ref={submitRef}
                onClick={() => {
                  dispatch(["isOpenUpdated", false]);
                }}
              >
                {_(msg`lesson.content.termination.accept`)}
              </Button>
            </FocusScope>
          </div>
        )}
        {state.content.template.layout.map((item, i) => (
          <LessonCardContentField
            params={item}
            content={state.content!}
            dispatch={dispatch}
            key={i}
          />
        ))}
      </Dialog.Content>
      <Dialog.Footer variants={{ justify: "center", class: "relative" }}>
        {state.meta.isTerminationRequested && <div className={terminationDialogOverlay} />}
        {state.content.form.isSubmitted
          ? <LessonCardGrades grades={state.content.grades} dispatch={dispatch} />
          : (
            <Button
              variants={{ style: "primary" }}
              ref={submitRef}
              onClick={() => {
                dispatch(["cardSubmitted"]);
              }}
            >
              {_(msg`lesson.content.submit`)}
            </Button>
          )}
      </Dialog.Footer>
    </>
  );
}
