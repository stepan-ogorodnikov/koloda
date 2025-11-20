import type { ReducerAction } from "@koloda/react";
import { dispatchReducerAction } from "@koloda/react";
import type { Card, TemplateField, TemplateFields, ZodIssue } from "@koloda/srs";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { produce } from "immer";

const fieldMessages: Record<string, MessageDescriptor> = {
  "too_small": msg`add-card.errors.field-empty`,
};

export type AddCardReducerState = {
  meta: {
    isDirty?: boolean;
    isError?: boolean;
  };
  fields: TemplateFields;
  content: Card["content"];
  errors: Record<string, MessageDescriptor[]>;
};

export const addCardReducerDefault: AddCardReducerState = {
  meta: {},
  fields: [],
  content: {},
  errors: {},
};

const actions = {
  fieldsSet,
  valueUpdated,
  formReset,
  errorReceived,
};

type FieldsSetPayload = TemplateFields;

function fieldsSet(draft: AddCardReducerState, payload: FieldsSetPayload) {
  draft.fields = payload;
  setContent(draft);
}

function setContent(draft: AddCardReducerState) {
  draft.content = draft.fields.reduce((acc, x) => (
    { ...acc, [x.id.toString()]: { text: "" } }
  ), {});
}

type ValueUpdatedPayload = {
  field: TemplateField["id"] | string;
  value: string;
};

function valueUpdated(draft: AddCardReducerState, { field, value }: ValueUpdatedPayload) {
  draft.content[field.toString()].text = value;
  draft.meta.isDirty = true;
  draft.meta.isError = false;
}

function formReset(draft: AddCardReducerState) {
  draft.meta.isDirty = false;
  setContent(draft);
}

function errorReceived(draft: AddCardReducerState, payload: ZodIssue[]) {
  draft.meta.isError = true;
  draft.errors = {};
  payload.forEach((issue) => {
    if (typeof issue.path[0] === "string" && issue.path[1] === "text") {
      if (!Array.isArray(draft.errors[issue.path[0]])) draft.errors[issue.path[0]] = [];
      const t = fieldMessages[issue.code];
      if (t) draft.errors[issue.path[0]].push(t);
    }
  });
}

export type AddCardReducerAction = ReducerAction<typeof actions, AddCardReducerState>;

export const addCardReducer = produce((draft: AddCardReducerState, action: AddCardReducerAction) => {
  dispatchReducerAction(draft, actions, action);
  return draft;
});
