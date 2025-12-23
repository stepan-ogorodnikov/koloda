import { lessonsQueryKeys } from "@koloda/react";
import type { Deck, LessonType } from "@koloda/srs";
import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQueryClient } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import { useEffect, useReducer } from "react";
import { LessonCompletion } from "./lesson-completion";
import { LessonContent } from "./lesson-content";
import { LessonInit } from "./lesson-init";
import { LessonProgressAmounts } from "./lesson-progress-amounts";
import { LessonProgressDots } from "./lesson-progress-dots";
import { lessonReducer, lessonReducerDefault } from "./lesson-reducer";
import { LessonUploader } from "./lesson-uploader";

export type LessonAtomValue = {
  type: LessonType;
  deckId?: Deck["id"] | null;
};

export const lessonAtom = atom<LessonAtomValue | null>(null);

export function Lesson() {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(lessonReducer, lessonReducerDefault);
  const [atomValue, setAtomValue] = useAtom(lessonAtom);
  const { status } = state.meta;

  useEffect(() => {
    if (!state.meta.isOpen) setAtomValue(null);
  }, [state.meta.isOpen, setAtomValue]);

  useEffect(() => {
    if (atomValue) dispatch(["paramsSet", atomValue]);
  }, [atomValue]);

  return (
    <Dialog.Root isOpen={state.meta.isOpen} onOpenChange={(value) => dispatch(["isOpenUpdated", value])}>
      <Button className="hidden" />
      <Dialog.Overlay isKeyboardDismissDisabled>
        <Dialog.Modal variants={{ class: "max-tb:w-full tb:min-w-112 min-h-96" }} isKeyboardDismissDisabled>
          <Dialog.Body>
            <Dialog.Header variants={{ class: "relative flex-col items-stretch gap-2 overflow-hidden" }}>
              <div className="relative grow flex flex-row items-start justify-between">
                {status === "init"
                  ? (
                    <Dialog.Title>
                      {_(msg`lesson.init.title`)}
                    </Dialog.Title>
                  )
                  : <LessonProgressAmounts state={state} />}
                <Dialog.Close
                  onClick={() => {
                    if (status === "started") {
                      dispatch(["terminationRequested", true]);
                    } else {
                      dispatch(["isOpenUpdated", false]);
                      queryClient.invalidateQueries({ queryKey: lessonsQueryKeys.all(state.filters) });
                      queryClient.invalidateQueries({ queryKey: lessonsQueryKeys.all() });
                    }
                  }}
                />
              </div>
              {status !== "init" && <LessonProgressDots state={state} />}
              <LessonUploader state={state} dispatch={dispatch} />
            </Dialog.Header>
            {status === "init" && <LessonInit state={state} dispatch={dispatch} />}
            {status === "started" && <LessonContent state={state} dispatch={dispatch} />}
            {status === "finished" && <LessonCompletion state={state} dispatch={dispatch} />}
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
