import { CloneAlgorithm, NotFound, queriesAtom } from "@koloda/react";
import type { UpdateAlgorithmValues } from "@koloda/srs";
import { algorithmsMessages, updateAlgorithmSchema as schema } from "@koloda/srs";
import { FormLayout, formLayout, Label, NumberField, Switch, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { DeleteAlgorithm } from "./delete-algorithm";

type AlgorithmProps = { id: string };

export function Algorithm({ id }: AlgorithmProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { getAlgorithmQuery, updateAlgorithmMutation } = useAtomValue(queriesAtom);
  const { data, isSuccess } = useQuery({ queryKey: ["algorithms", id], ...getAlgorithmQuery(id) });
  const { mutate } = useMutation(updateAlgorithmMutation());
  const form = useAppForm({
    defaultValues: data as UpdateAlgorithmValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ formApi, value }) => {
      mutate({ id: Number(id), values: schema.parse(value) }, {
        onSuccess: (algorithm) => {
          queryClient.invalidateQueries({ queryKey: ["algorithms"] });
          queryClient.setQueryData(["algorithms", id], algorithm);
          formApi.reset();
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
            <Label variants={{ layout: "form" }}>{_(msg`algorithm.inputs.title.label`)}</Label>
            <TextField.Input variants={{ layout: "form" }} />
          </TextField>
        )}
      </form.Field>
      <form.Field name="content.retention">
        {(field) => (
          <NumberField
            variants={{ layout: "form" }}
            step={0.001}
            value={field.state.value}
            onChange={field.handleChange}
          >
            <Label variants={{ layout: "form" }}>{_(msg`algorithm.inputs.retention.label`)}</Label>
            <NumberField.Group />
          </NumberField>
        )}
      </form.Field>
      <FormLayout.Section>
        <FormLayout.Section.Term />
        <FormLayout.Section.Content>
          <form.Field name="content.isFuzzEnabled">
            {(field) => (
              <Switch
                isSelected={field.state.value}
                onChange={field.handleChange}
              >
                <Switch.Indicator />
                <Switch.Label>{_(msg`algorithm.inputs.isFuzzEnabled.label`)}</Switch.Label>
              </Switch>
            )}
          </form.Field>
        </FormLayout.Section.Content>
      </FormLayout.Section>
      <form.Field name="content.weights">
        {(field) => (
          <TextField
            variants={{ layout: "form" }}
            value={field.state.value}
            onChange={field.handleChange}
          >
            <Label variants={{ layout: "form" }}>{_(msg`algorithm.inputs.weights.label`)}</Label>
            <TextField.TextArea variants={{ layout: "form", content: "number" }} rows={3} />
          </TextField>
        )}
      </form.Field>
      <form.Field name="content.learningSteps">
        {(field) => (
          <TextField
            variants={{ layout: "form" }}
            value={field.state.value}
            onChange={field.handleChange}
          >
            <Label variants={{ layout: "form" }}>{_(msg`algorithm.inputs.learning-steps.label`)}</Label>
            <TextField.Input variants={{ layout: "form" }} />
          </TextField>
        )}
      </form.Field>
      <form.Field name="content.relearningSteps">
        {(field) => (
          <TextField
            variants={{ layout: "form" }}
            value={field.state.value}
            onChange={field.handleChange}
          >
            <Label variants={{ layout: "form" }}>{_(msg`algorithm.inputs.relearning-steps.label`)}</Label>
            <TextField.Input variants={{ layout: "form" }} />
          </TextField>
        )}
      </form.Field>
      <form.Field name="content.maximumInterval">
        {(field) => (
          <NumberField
            variants={{ layout: "form" }}
            minValue={0}
            value={field.state.value}
            onChange={field.handleChange}
          >
            <Label variants={{ layout: "form" }}>{_(msg`algorithm.inputs.maximum-interval.label`)}</Label>
            <NumberField.Group />
          </NumberField>
        )}
      </form.Field>
      <FormLayout.Section term={_(msg`algorithm.actions.label`)}>
        <div className="flex flex-row flex-wrap items-center gap-2">
          <CloneAlgorithm id={id} />
          <DeleteAlgorithm id={id} />
        </div>
      </FormLayout.Section>
      {formErrorMap.onSubmit && <form.Errors errors={formErrorMap.onSubmit} translations={algorithmsMessages} />}
      <form.AppForm>
        <form.Controls />
      </form.AppForm>
    </form>
  );
}
