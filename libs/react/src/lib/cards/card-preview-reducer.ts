import type { LessonReducerState, ReducerAction } from "@koloda/react";
import { dispatchReducerAction } from "@koloda/react";
import { type Card, convertTemplateToLessonTemplate, type Template } from "@koloda/srs";
import { produce } from "immer";

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
    const canSubmit = template.layout.reduce((acc, x) => (
      acc || x.operation !== "display"
    ), false);

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

function cardFormUpdated(draft: LessonReducerState, { key, value }: CardFormUpdatedPayload) {
  if (draft.content) draft.content.form.data[key] = value;
}

function cardSubmitted(draft: LessonReducerState) {
  if (draft.content && !draft.content?.form.isSubmitted) draft.content.form.isSubmitted = true;
}

export type CardPreviewReducerAction = ReducerAction<typeof actions, CardPreviewReducerState>;

export const cardPreviewReducer = produce((draft: CardPreviewReducerState, action: CardPreviewReducerAction) => {
  dispatchReducerAction(draft, actions, action);
  return draft;
});
