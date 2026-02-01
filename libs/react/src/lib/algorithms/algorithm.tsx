import { algorithmsQueryKeys, CloneAlgorithm, NotFound, queriesAtom } from "@koloda/react";
import type { Algorithm, UpdateAlgorithmValues } from "@koloda/srs";
import { algorithmsMessages, updateAlgorithmSchema as schema } from "@koloda/srs";
import { FormLayout, formLayout, Label, NumberField, Switch, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { AlgorithmLearningSteps } from "./algorithm-learning-steps";
import { DeleteAlgorithm } from "./delete-algorithm";

type AlgorithmProps = { id: Algorithm["id"] };

export function Algorithm({ id }: AlgorithmProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { getAlgorithmQuery, updateAlgorithmMutation } = useAtomValue(queriesAtom);
  const { data, isSuccess } = useQuery({ queryKey: algorithmsQueryKeys.detail(id), ...getAlgorithmQuery(id) });
  const { mutate } = useMutation(updateAlgorithmMutation());
  const form = useAppForm({
    defaultValues: data as UpdateAlgorithmValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ formApi, value }) => {
      mutate({ id: Number(id), values: schema.parse(value) }, {
        onSuccess: (algorithm) => {
          queryClient.invalidateQueries({ queryKey: algorithmsQueryKeys.all() });
          queryClient.setQueryData(algorithmsQueryKeys.detail(id), algorithm);
          formApi.reset();
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
            <Label variants={{ layout: "form" }}>{_(msg`algorithm.inputs.title.label`)}</Label>
            <TextField.Input variants={{ layout: "form" }} />
          </TextField>
        )}
      </form.Field>
      <form.Field name="content.retention">
        {(field) => (
          <NumberField
            variants={{ layout: "form" }}
            minValue={70}
            maxValue={99}
            step={1}
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
      <FormLayout.Section term={_(msg`algorithm.inputs.learning-steps.label`)}>
        <AlgorithmLearningSteps type="learningSteps" form={form} />
      </FormLayout.Section>
      <FormLayout.Section term={_(msg`algorithm.inputs.relearning-steps.label`)}>
        <AlgorithmLearningSteps type="relearningSteps" form={form} />
      </FormLayout.Section>
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
      <form.AppForm>
        <form.Controls translations={algorithmsMessages} />
      </form.AppForm>
    </form>
  );
}
