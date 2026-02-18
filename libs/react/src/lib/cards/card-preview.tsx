import {
  LessonCardField,
  lessonContent,
  LessonFooterLayout,
  LessonHeaderLayout,
  lessonStudying,
  queriesAtom,
  templatesQueryKeys,
} from "@koloda/react";
import type { Card, Template } from "@koloda/srs";
import { Button, Dialog, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
import { useEffect, useReducer } from "react";
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
  const query = useQuery({
    queryKey: templatesQueryKeys.detail(templateId),
    ...getTemplateQuery(templateId),
  });

  useEffect(() => {
    dispatch(["cardUpdated", card]);
  }, [card]);

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
                    dispatch={dispatch}
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
