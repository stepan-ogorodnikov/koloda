import { CloneTemplate, DeleteTemplate, NotFound, queriesAtom, templatesQueryKeys } from "@koloda/react";
import type { Template, UpdateTemplateValues } from "@koloda/srs";
import { templatesMessages, updateTemplateSchema as schema } from "@koloda/srs";
import { FormLayout, formLayout, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { TemplateFields } from "./template-fields";
import { TemplateLayout } from "./template-layout";

type TemplateProps = { id: Template["id"] };

export function Template({ id }: TemplateProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { getTemplateQuery, updateTemplateMutation } = useAtomValue(queriesAtom);
  const { data, isSuccess } = useQuery({ queryKey: templatesQueryKeys.detail(id), ...getTemplateQuery(id) });
  const { mutate } = useMutation(updateTemplateMutation());
  const form = useAppForm({
    defaultValues: data as UpdateTemplateValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ formApi, value }) => {
      mutate({ id: Number(id), values: schema.parse(value) }, {
        onSuccess: (returning) => {
          queryClient.invalidateQueries({ queryKey: templatesQueryKeys.all() });
          queryClient.setQueryData(templatesQueryKeys.detail(id), returning);
          formApi.reset(returning);
        },
      });
    },
  });

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
        <form.Timestamps>
          <form.Timestamp>ID: {data?.id}</form.Timestamp>
          <form.CreatedAt timestamp={data?.createdAt} />
          <form.UpdatedAt timestamp={data?.updatedAt} />
        </form.Timestamps>
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
      <FormLayout.Section term={_(msg`template.fields.label`)}>
        <TemplateFields form={form} isLocked={data?.isLocked || false} />
      </FormLayout.Section>
      <FormLayout.Section term={_(msg`template.layout.label`)}>
        <TemplateLayout form={form} />
      </FormLayout.Section>
      <FormLayout.Section term={_(msg`template.actions.label`)}>
        <div className="flex flex-row flex-wrap items-center gap-2">
          <CloneTemplate id={id} />
          <DeleteTemplate id={id} />
        </div>
      </FormLayout.Section>
      <form.AppForm>
        <form.Controls translations={templatesMessages} />
      </form.AppForm>
    </form>
  );
}
