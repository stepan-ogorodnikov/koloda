import { CloneTemplate, DeleteTemplate, NotFound, queriesAtom } from "@koloda/react";
import type { Template, UpdateTemplateValues } from "@koloda/srs";
import { templatesMessages, updateTemplateSchema as schema } from "@koloda/srs";
import { FormLayout, formLayout, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { TemplateFields } from "./template-fields";
import { TemplateLayout } from "./template-layout";

type TemplateProps = { id: string };

export function Template({ id }: TemplateProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { getTemplateQuery, updateTemplateMutation } = useAtomValue(queriesAtom);
  const { data, isSuccess } = useQuery({ queryKey: ["templates", id], ...getTemplateQuery(id) });
  const { mutate } = useMutation(updateTemplateMutation());
  const form = useAppForm({
    defaultValues: data as UpdateTemplateValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ formApi, value }) => {
      mutate({ id: Number(id), values: schema.parse(value) }, {
        onSuccess: (template) => {
          queryClient.invalidateQueries({ queryKey: ["templates"] });
          queryClient.setQueryData(["templates", id], template);
          formApi.reset(template);
        },
      });
    },
  });
  const formErrorMap = useStore(form.store, (state) => state.errorMap);

  if (isSuccess && data === null) return <NotFound />;

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
      <form.Field name="title">
        {(field) => (
          <TextField
            variants={{ layout: "form" }}
            value={field.state.value}
            onChange={field.handleChange}
          >
            <Label variants={{ layout: "form" }}>{_(msg`template.inputs.title.label`)}</Label>
            <TextField.Input variants={{ layout: "form" }} />
          </TextField>
        )}
      </form.Field>
      <FormLayout.Section>
        <FormLayout.Section.Term>
          {_(msg`template.status.title`)}
        </FormLayout.Section.Term>
        <FormLayout.Section.Content>
          <div className="fg-level-2 font-medium tracking-wide">
            {data?.isLocked
              ? (
                _(msg`template.status.locked`)
              )
              : (
                _(msg`template.status.unlocked`)
              )}
          </div>
        </FormLayout.Section.Content>
      </FormLayout.Section>
      <FormLayout.Section term={_(msg`template.inputs.fields.label`)}>
        <TemplateFields form={form} isLocked={data?.isLocked || false} />
      </FormLayout.Section>
      <FormLayout.Section term={_(msg`template.inputs.layout.label`)}>
        <TemplateLayout form={form} />
      </FormLayout.Section>
      <FormLayout.Section term={_(msg`template.actions.label`)}>
        <div className="flex flex-row items-center gap-2">
          <CloneTemplate id={id} />
          <DeleteTemplate id={id} />
        </div>
      </FormLayout.Section>
      {formErrorMap.onSubmit && <form.Errors errors={formErrorMap.onSubmit} translations={templatesMessages} />}
    </form>
  );
}
