import { AlgorithmPicker } from "@koloda/react";
import type { UpdateDeckValues } from "@koloda/srs";
import { updateDeckSchema as schema } from "@koloda/srs";
import { FormLayout, formLayout, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { queriesAtom } from "../queries";
import { TemplatePicker } from "../templates/template-picker";
import { DeleteDeck } from "./delete-deck";

type DeckDetailsProps = { id: string };

export function DeckDetails({ id }: DeckDetailsProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { getDeckQuery, updateDeckMutation } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: ["decks", id], ...getDeckQuery(id) });
  const { mutate } = useMutation(updateDeckMutation());
  const form = useAppForm({
    defaultValues: data as UpdateDeckValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ formApi, value }) => {
      mutate({ id: Number(id), values: schema.parse(value) }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["decks"] });
          queryClient.invalidateQueries({ queryKey: ["decks", id] });
          formApi.reset();
        },
      });
    },
  });
  const formErrorMap = useStore(form.store, (state) => state.errorMap);

  if (!data) return null;

  return (
    <form
      className={formLayout}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <FormLayout.Section>
        <FormLayout.Section.Term>
          <form.AppForm>
            <form.FormControls />
          </form.AppForm>
        </FormLayout.Section.Term>
        <FormLayout.Section.Content>
          <form.FormTimestamps>
            <form.FormCreatedAt timestamp={data?.createdAt} />
            <form.FormUpdatedAt timestamp={data?.updatedAt} />
          </form.FormTimestamps>
        </FormLayout.Section.Content>
      </FormLayout.Section>
      <form.AppField name="title">
        {(field) => (
          <field.TextField variants={{ layout: "form" }}>
            <Label variants={{ layout: "form" }}>{_(msg`deck.inputs.title.label`)}</Label>
            <TextField.Input variants={{ layout: "form" }} />
          </field.TextField>
        )}
      </form.AppField>
      <form.Field name="algorithmId">
        {(field) => (
          <AlgorithmPicker
            variants={{ layout: "form" }}
            value={Number(field.state.value)}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="templateId">
        {(field) => (
          <TemplatePicker
            variants={{ layout: "form" }}
            value={Number(field.state.value)}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <FormLayout.Section term={_(msg`deck.actions.label`)}>
        <DeleteDeck id={id} />
      </FormLayout.Section>
      {formErrorMap.onSubmit && <form.Errors errors={formErrorMap.onSubmit} />}
    </form>
  );
}
