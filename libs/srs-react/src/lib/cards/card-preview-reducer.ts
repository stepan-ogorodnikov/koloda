import type { ReducerAction } from "@koloda/core-react";
import { dispatchReducerAction } from "@koloda/core-react";
import type { Card, Template } from "@koloda/srs";
import { convertTemplateToLessonTemplate } from "@koloda/srs";
import { produce } from "immer";
import type { LessonReducerState } from "../lessons/lesson-reducer";

export type CardPreviewReducerState = {
  card?: Card;
  template?: Template;
  content?: LessonReducerState["content"];
};

export const cardPreviewReducerDefault: CardPreviewReducerState = {};

const actions = {
  cardUpdated,
  templateUpdated,
  cardFormUpdated,
  cardSubmitted,
};

function cardUpdated(draft: CardPreviewReducerState, payload: Card) {
  draft.card = payload;
  setContent(draft);
}

function templateUpdated(draft: CardPreviewReducerState, payload: Template) {
  draft.template = payload;
  setContent(draft);
}

function setContent(draft: CardPreviewReducerState) {
  if (draft.template && draft.card) {
    const template = convertTemplateToLessonTemplate(draft.template);
    const canSubmit = template.layout.reduce((acc, x) => acc || x.operation !== "display", false);

    draft.content = {
      index: 0,
      startedAt: 0,
      form: {
        firstInputFieldId: template.layout.find((x) => x.operation === "type")?.field?.id,
        data: {},
        isSubmitted: !canSubmit,
      },
      card: draft.card,
      template,
      grades: [],
    };
  }
}

type CardFormUpdatedPayload = {
  key: number | string;
  value: string;
};

function cardFormUpdated(draft: CardPreviewReducerState, { key, value }: CardFormUpdatedPayload) {
  if (draft.content) draft.content.form.data[key] = value;
}

function cardSubmitted(draft: CardPreviewReducerState) {
  if (draft.content && !draft.content?.form.isSubmitted) draft.content.form.isSubmitted = true;
}

export type CardPreviewReducerAction = ReducerAction<typeof actions, CardPreviewReducerState>;

export function cardPreviewReducer(state: CardPreviewReducerState, action: CardPreviewReducerAction) {
  return produce(state, (draft) => {
    dispatchReducerAction(draft, actions, action);
  });
}
