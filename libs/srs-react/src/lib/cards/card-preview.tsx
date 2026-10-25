import { queriesAtom, useAppHotkey } from "@koloda/core-react";
import type { Card, Template } from "@koloda/srs";
import { Button, Dialog, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
import { useEffect, useReducer, useRef } from "react";
import { lessonContent } from "../lessons/lesson";
import { LessonCardField } from "../lessons/lesson-card-field";
import { LessonFooterLayout } from "../lessons/lesson-footer";
import { LessonHeaderLayout } from "../lessons/lesson-header";
import { lessonStudying } from "../lessons/lesson-studying";
import { cardPreviewReducer, cardPreviewReducerDefault } from "./card-preview-reducer";

type PreviewCardProps = {
  isOpen: boolean;
  onOpenChange: (value: boolean) => void;
  card: Card;
  templateId: Template["id"];
};

export function CardPreview({ isOpen, onOpenChange, card, templateId }: PreviewCardProps) {
  const { _ } = useLingui();
  const [state, dispatch] = useReducer(cardPreviewReducer, cardPreviewReducerDefault);
  const { getTemplateQuery } = useAtomValue(queriesAtom);
  const query = useQuery(getTemplateQuery(templateId));
  const submitRef = useRef<HTMLButtonElement>(null);
  const firstInputFieldId = state.content?.form.firstInputFieldId;
  const isFormSubmitted = state.content?.form.isSubmitted;

  // WHY: every table row mounts a closed preview, so the keys are on only while this one is open.
  // The lesson binds them in its "grades" scope, which only a lesson session turns on.
  useAppHotkey(["Enter", "Space"], () => dispatch(["cardSubmitted"]), "", {
    conflictBehavior: "allow",
    enabled: isOpen,
  });

  useEffect(() => {
    dispatch(["cardUpdated", card]);
  }, [card]);

  useEffect(() => {
    if (isOpen && !firstInputFieldId && isFormSubmitted === false) submitRef.current?.focus();
  }, [isOpen, firstInputFieldId, isFormSubmitted]);

  useEffect(() => {
    if (query.data) dispatch(["templateUpdated", query.data]);
  }, [query.data]);

  return (
    <Dialog.Overlay isOpen={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Modal variants={{ size: "main" }}>
        <Dialog.Body>
          <div className="grow flex flex-col">
            <LessonHeaderLayout>
              <Dialog.Close variants={{ class: "absolute top-0 right-0" }} slot="close" />
            </LessonHeaderLayout>
            <div className={lessonContent} key={card.id}>
              <div className={lessonStudying}>
                {(state.content?.template.layout || []).map((item, i) => (
                  <LessonCardField
                    params={item}
                    content={state.content!}
                    onFormChange={(key, value) => dispatch(["cardFormUpdated", { key, value }])}
                    onSubmit={() => dispatch(["cardSubmitted"])}
                    key={i}
                  />
                ))}
              </div>
            </div>
            <LessonFooterLayout>
              <AnimatePresence>
                {!state.content?.form.isSubmitted && (
                  <Fade key="submit">
                    <Button
                      variants={{ style: "primary" }}
                      ref={submitRef}
                      onClick={() => dispatch(["cardSubmitted"])}
                      key="submit"
                    >
                      {_(msg`lesson.content.submit`)}
                    </Button>
                  </Fade>
                )}
              </AnimatePresence>
            </LessonFooterLayout>
          </div>
        </Dialog.Body>
      </Dialog.Modal>
    </Dialog.Overlay>
  );
}
