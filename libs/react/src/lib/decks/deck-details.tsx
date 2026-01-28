import { AlgorithmPicker } from "@koloda/react";
import { decksQueryKeys, queriesAtom } from "@koloda/react";
import type { UpdateDeckValues } from "@koloda/srs";
import { decksMessages, updateDeckSchema as schema } from "@koloda/srs";
import { FormLayout, formLayout, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { TemplatePicker } from "../templates/template-picker";
import { DeleteDeck } from "./delete-deck";

type DeckDetailsProps = { id: string };

export function DeckDetails({ id }: DeckDetailsProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { getDeckQuery, updateDeckMutation } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: decksQueryKeys.detail(id), ...getDeckQuery(id) });
  const { mutate } = useMutation(updateDeckMutation());
  const form = useAppForm({
    defaultValues: data as UpdateDeckValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ formApi, value }) => {
      mutate({ id: Number(id), values: schema.parse(value) }, {
        onSuccess: (returning) => {
          queryClient.invalidateQueries({ queryKey: decksQueryKeys.all() });
          queryClient.invalidateQueries({ queryKey: decksQueryKeys.detail(id) });
          queryClient.setQueryData(decksQueryKeys.detail(id), returning);
          formApi.reset();
        },
      });
    },
  });

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
        <form.Timestamps>
          <form.Timestamp>ID: {data?.id}</form.Timestamp>
          <form.CreatedAt timestamp={data?.createdAt} />
          <form.UpdatedAt timestamp={data?.updatedAt} />
        </form.Timestamps>
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
            onChange={field.handleChange as any}
          />
        )}
      </form.Field>
      <form.Field name="templateId">
        {(field) => (
          <TemplatePicker
            variants={{ layout: "form" }}
            value={Number(field.state.value)}
            onChange={field.handleChange as any}
          />
        )}
      </form.Field>
      <FormLayout.Section term={_(msg`deck.actions.label`)}>
        <DeleteDeck id={id} />
      </FormLayout.Section>
      <form.AppForm>
        <form.Controls translations={decksMessages} />
      </form.AppForm>
    </form>
  );
}
