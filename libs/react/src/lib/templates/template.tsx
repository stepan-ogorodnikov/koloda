import { SquareLock01Icon, SquareUnlock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CloneTemplate, DeleteTemplate, NotFound } from "@koloda/react";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { Template as TemplateType, UpdateTemplateValues } from "@koloda/srs";
import { toFormErrors, updateTemplateSchema as schema } from "@koloda/srs";
import { FormLayout, formLayout, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { TemplateFields } from "./template-fields";
import { TemplateLayout } from "./template-layout";

type TemplateProps = { id: TemplateType["id"] };

export function Template({ id }: TemplateProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { getTemplateQuery, updateTemplateMutation } = useAtomValue(queriesAtom);
  const { data, isSuccess } = useQuery({ queryKey: queryKeys.templates.detail(id), ...getTemplateQuery(id) });
  const { mutate } = useMutation(updateTemplateMutation());
  const form = useAppForm({
    defaultValues: data as UpdateTemplateValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ formApi, value }) => {
      mutate({ id: Number(id), values: schema.parse(value) }, {
        onSuccess: (returning) => {
          queryClient.invalidateQueries({ queryKey: queryKeys.templates.all() });
          queryClient.setQueryData(queryKeys.templates.detail(id), returning);
          formApi.reset(returning);
        },
        onError: (error) => {
          formApi.setErrorMap({ onSubmit: toFormErrors(error) });
        },
      });
    },
  });

  useEffect(() => {
    if (data?.id) form.reset();
  }, [data?.id, form]);

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
          <div className="flex flex-row gap-2 fg-level-2 font-medium tracking-wide">
            {data?.isLocked
              ? <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={SquareLock01Icon} />
              : <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={SquareUnlock01Icon} />}
            {data?.isLocked ? _(msg`template.status.locked`) : _(msg`template.status.unlocked`)}
          </div>
        </FormLayout.Section.Content>
      </FormLayout.Section>
      <FormLayout.Section>
        <FormLayout.Section.Term>
          {_(msg`template.fields.label`)}
        </FormLayout.Section.Term>
        <FormLayout.Section.Content variants={{ class: "w-full" }}>
          <TemplateFields form={form} isLocked={data?.isLocked || false} />
        </FormLayout.Section.Content>
      </FormLayout.Section>
      <FormLayout.Section>
        <FormLayout.Section.Term>
          {_(msg`template.layout.label`)}
        </FormLayout.Section.Term>
        <FormLayout.Section.Content variants={{ class: "w-full" }}>
          <TemplateLayout form={form} />
        </FormLayout.Section.Content>
      </FormLayout.Section>
      <FormLayout.Section term={_(msg`template.actions.label`)}>
        <div className="flex flex-row flex-wrap items-center gap-2">
          <CloneTemplate id={id} />
          <DeleteTemplate id={id} isLocked={data.isLocked} />
        </div>
      </FormLayout.Section>
      <form.AppForm>
        <form.Controls />
      </form.AppForm>
    </form>
  );
}
