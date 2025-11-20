import type { Card, TemplateField } from "@koloda/srs";
import { Label, TextField } from "@koloda/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ActionDispatch, Ref } from "react";
import type { AddCardReducerAction } from "./add-card-reducer";

type AddCardFieldsItemProps = {
  field: TemplateField;
  value: Card["content"][string];
  dispatch: ActionDispatch<[action: AddCardReducerAction]>;
  autoFocus?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
  errors?: MessageDescriptor[];
};

export function AddCardFieldsItem({ ref, field, value, dispatch, autoFocus, errors }: AddCardFieldsItemProps) {
  const { _ } = useLingui();

  return (
    <TextField
      value={value?.text || ""}
      onChange={(e) => {
        dispatch(["valueUpdated", { field: field.id, value: e }]);
      }}
      autoFocus={autoFocus}
    >
      <Label>{field.title}</Label>
      <TextField.TextArea placeholder={_(msg`add-card.field.placeholder`)} ref={ref} />
      {errors && <TextField.Errors messages={errors} />}
    </TextField>
  );
}
