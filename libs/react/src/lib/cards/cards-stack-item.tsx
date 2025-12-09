import { queriesAtom } from "@koloda/react";
import type { Card, UpdateCardValues, ZodIssue } from "@koloda/srs";
import { cardContentMessages, getUpdateCardSchema, updateCardSchema as schema } from "@koloda/srs";
import { Button, FormLayout, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { CardState } from "./card-state";
import { DeleteCard } from "./delete-card";

const TIMESTAMP_OPTIONS = {
  year: "numeric",
  month: "long",
  day: "numeric",
} as Intl.DateTimeFormatOptions;

type CardsStackItemProps = { card: Card };

export function CardsStackItem({ card }: CardsStackItemProps) {
  const queryClient = useQueryClient();
  const { i18n, _ } = useLingui();
  const { getTemplateQuery, updateCardMutation, resetCardProgressMutation } = useAtomValue(queriesAtom);
  const { data: template } = useQuery({
    queryKey: ["templates", `${card.templateId}`],
    ...getTemplateQuery(`${card.templateId}`),
  });
  const { mutate } = useMutation(updateCardMutation());
  const resetProgressMutation = useMutation(resetCardProgressMutation());
  const form = useAppForm({
    defaultValues: card as UpdateCardValues,
    validators: { onSubmit: template ? getUpdateCardSchema(template) : schema },
    onSubmit: async ({ formApi, value }) => {
      mutate({ id: card.id, values: value }, {
        onSuccess: (returning) => {
          queryClient.invalidateQueries({ queryKey: ["cards", `${card.deckId}`] });
          formApi.reset(returning);
        },
      });
    },
  });

  useEffect(() => {
    form.reset();
  }, [card.id, form]);

  const handleProgressReset = () => {
    resetProgressMutation.mutate({ id: card.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["cards", `${card.deckId}`] });
      },
    });
  };

  if (!template) return null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <FormLayout.Section>
        <form.Timestamps>
          <form.Timestamp>ID: {card?.id}</form.Timestamp>
          <form.CreatedAt timestamp={card?.createdAt} />
          <form.UpdatedAt timestamp={card?.updatedAt} />
        </form.Timestamps>
      </FormLayout.Section>
      {template.content.fields.map(({ id, title }) => (
        <form.AppField name={`content.${id}.text`} key={id}>
          {(field) => (
            <field.TextField variants={{ layout: "form" }}>
              <Label variants={{ layout: "form" }}>{title}</Label>
              <TextField.Content>
                <TextField.TextArea variants={{ layout: "form" }} />
                {!field.state.meta.isValid && (
                  <TextField.Errors errors={field.state.meta.errors as ZodIssue[]} translations={cardContentMessages} />
                )}
              </TextField.Content>
            </field.TextField>
          )}
        </form.AppField>
      ))}
      <FormLayout.Section variants={{ class: "flex-row items-baseline gap-6" }} term={_(msg`card.labels.state`)}>
        <FormLayout.Section.Content>
          <CardState value={card.state as number} />
        </FormLayout.Section.Content>
      </FormLayout.Section>
      {!!card.dueAt && (
        <FormLayout.Section variants={{ class: "flex-row items-baseline gap-6" }} term={_(msg`card.labels.due-at`)}>
          <FormLayout.Section.Content>
            {i18n.date(card.dueAt, TIMESTAMP_OPTIONS)}
          </FormLayout.Section.Content>
        </FormLayout.Section>
      )}
      <FormLayout.Section term={_(msg`card.labels.actions`)}>
        <FormLayout.Section.Content>
          <div className="flex flex-row flex-wrap items-center gap-2">
            {!!card.state && (
              <Button variants={{ style: "primary" }} onClick={handleProgressReset}>
                <RotateCcw className="size-4 stroke-1.5" />
                {_(msg`card.action.reset-progress`)}
              </Button>
            )}
            <DeleteCard id={card.id} deckId={card.deckId} />
          </div>
        </FormLayout.Section.Content>
      </FormLayout.Section>
      <form.AppForm>
        <form.Controls />
      </form.AppForm>
    </form>
  );
}
